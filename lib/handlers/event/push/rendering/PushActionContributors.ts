/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ApolloGraphClient } from "@atomist/automation-client/lib/graph/ApolloGraphClient";
import { TokenCredentials } from "@atomist/automation-client/lib/operations/common/ProjectOperationCredentials";
import { QueryNoCacheOptions } from "@atomist/automation-client/lib/spi/graph/GraphClient";
import { buttonForCommand } from "@atomist/automation-client/lib/spi/message/MessageClient";
import { logger } from "@atomist/automation-client/lib/util/logger";
import {
    AbstractIdentifiableContribution,
    GoalSet,
    graphql,
    isFullRenderingEnabled,
    lastGoalSet,
    LifecycleActionPreferences,
    LifecycleConfiguration,
    LifecycleRendererPreferences,
    RendererContext,
    SlackActionContributor,
    truncateCommitMessage,
} from "@atomist/sdm-pack-lifecycle";
import { UpdateSdmGoalDisplayState } from "@atomist/sdm-pack-lifecycle/lib/handlers/command/sdm/UpdateSdmGoalDisplayState";
import { UpdateSdmGoalState } from "@atomist/sdm-pack-lifecycle/lib/handlers/command/sdm/UpdateSdmGoalState";
import {
    Action,
    githubToSlack,
} from "@atomist/slack-messages";
import * as _ from "lodash";
import * as semver from "semver";
import {
    PushFields,
    SdmGoalDisplayFormat,
    SdmGoalDisplayState,
    SdmGoalState,
} from "../../../../typings/types";
import { CreateGitHubRelease } from "../../../command/github/CreateGitHubRelease";
import { CreateGitHubTag } from "../../../command/github/CreateGitHubTag";
import { DefaultGitHubApiUrl } from "../../../command/github/gitHubApi";

const RepositoryTagsQuery = `query RepositoryTags($name: String!, $owner: String!) {
  repository(name: $name, owner: $owner) {
    refs(
      refPrefix: "refs/tags/"
      first: 1
      orderBy: { field: TAG_COMMIT_DATE, direction: DESC }
    ) {
      nodes {
        name
      }
    }
  }
}
`;

export class ReleaseActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<graphql.PushFields.Tags> {

    constructor() {
        super(LifecycleActionPreferences.push.release.id);
    }

    public supports(node: any): boolean {
        return node.release === null;
    }

    public buttonsFor(tag: graphql.PushFields.Tags, context: RendererContext): Promise<Action[]> {
        const repo = context.lifecycle.extract("repo") as graphql.PushFields.Repo;
        const push = context.lifecycle.extract("push") as graphql.PushToPushLifecycle.Push;
        const buttons = [];

        // Check that there are no releases already
        const released = push.commits.some(c => c.tags && c.tags.some(t => t.release !== null));
        // Check that the tag is M.M.P-QUALIFIER
        const majorMinorPatchTag = !tag.name.includes("+");

        if (!released && majorMinorPatchTag) {
            buttons.push(this.createReleaseButton(push, tag, repo));
        }

        return Promise.resolve(buttons);
    }

    public menusFor(tag: graphql.PushFields.Tags, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createReleaseButton(push: graphql.PushToPushLifecycle.Push,
                                tag: graphql.PushFields.Tags,
                                repo: graphql.PushFields.Repo): Action {
        let commitMessage = "Release created by Atomist GitHub Notifications Skill";

        // We do not have a tag message in our model so let's fallback onto
        // commits by locating the commit for that particular tag
        // If that commit doesn't have a message set, let's not use it.
        const commits = push.commits.filter(
            c => (!!c.tags && !!c.message
                && c.tags.filter(t => t.name === tag.name).length > 0));

        if (commits.length !== 0) {
            // should I format to slack here?
            commitMessage = truncateCommitMessage(
                githubToSlack(commits[0].message), repo);
        }

        const releaseHandler = new CreateGitHubRelease();
        releaseHandler.tag = tag.name;
        releaseHandler.message = commitMessage;
        releaseHandler.owner = repo.owner;
        releaseHandler.repo = repo.name;

        return buttonForCommand({
            text: "Release",
            role: "global",
            confirm: {
                title: "Create Release",
                text: `Create release of tag ${tag.name}?`, ok_text: "Ok", dismiss_text: "Cancel",
            },
        }, releaseHandler);
    }
}

export class TagPushActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<graphql.PushToPushLifecycle.Push> {

    constructor() {
        super(LifecycleActionPreferences.push.new_tag.id);
    }

    public supports(node: any): boolean {
        if (node.after) {
            const push = node as graphql.PushToPushLifecycle.Push;
            return push.commits && !push.commits.some(c => c.tags && c.tags.length > 0);
        } else {
            return false;
        }
    }

    public buttonsFor(push: graphql.PushToPushLifecycle.Push, context: RendererContext): Promise<Action[]> {
        const repo = context.lifecycle.extract("repo") as graphql.PushFields.Repo;

        const branch = repo.defaultBranch || "master";
        if (context.rendererId === "commit" && push.branch === branch) {
            return this.createTagButton(push, repo, context);
        }

        return Promise.resolve([]);
    }

    public menusFor(push: graphql.PushToPushLifecycle.Push, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createTagButton(push: graphql.PushToPushLifecycle.Push,
                            repo: graphql.PushFields.Repo,
                            context: RendererContext): Promise<Action[]> {

        // Add the create tag button
        const tagHandler = new CreateGitHubTag();
        tagHandler.message = push.after.message || "Tag created by Atomist GitHub Notifications Skill";
        tagHandler.sha = push.after.sha;
        tagHandler.repo = repo.name;
        tagHandler.owner = repo.owner;
        tagHandler.apiUrl = repo.org.provider.apiUrl;

        const defaultTagAction = [buttonForCommand(
            {
                text: "Tag",
                role: "global",
            },
            tagHandler)];

        if (repo.org &&
            repo.org.provider &&
            repo.org.provider.apiUrl === DefaultGitHubApiUrl &&
            !!context.credentials &&
            !!(context.credentials as TokenCredentials).token) {

            const client = new ApolloGraphClient("https://api.github.com/graphql",
                { Authorization: `bearer ${(context.credentials as TokenCredentials).token}` });

            return client.query<any, any>({
                query: RepositoryTagsQuery,
                variables: { owner: repo.owner, name: repo.name },
            })
                .then(result => {
                    const lastTag = _.get(result, "repository.refs.nodes[0].name");
                    if (lastTag && semver.valid(lastTag)) {
                        return Promise.resolve([
                            buttonForCommand(
                                { text: "Tag" },
                                "createGitHubTagSelection",
                                {
                                    ...tagHandler,
                                    lastTag,
                                }),
                        ]);
                    } else {
                        return Promise.resolve(defaultTagAction);
                    }
                });
        } else {
            return Promise.resolve(defaultTagAction);
        }
    }
}

export function sortTagsByName(tags: graphql.PushFields.Tags[]): graphql.PushFields.Tags[] {
    return tags
        .filter(t => t.name)
        .sort((t1, t2) => t1.name.localeCompare(t2.name));
}

export class TagTagActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<graphql.PushFields.Tags> {

    constructor() {
        super(LifecycleActionPreferences.push.tag.id);
    }

    public supports(node: any): boolean {
        return node.release === null;
    }

    public buttonsFor(tag: graphql.PushFields.Tags, context: RendererContext): Promise<Action[]> {
        const repo = context.lifecycle.extract("repo") as graphql.PushFields.Repo;
        const push = context.lifecycle.extract("push") as graphql.PushToPushLifecycle.Push;
        return this.createTagButton(tag, push, repo, context);
    }

    public menusFor(tag: graphql.PushFields.Tags, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createTagButton(tag: graphql.PushFields.Tags,
                            push: graphql.PushToPushLifecycle.Push,
                            repo: graphql.PushFields.Repo,
                            ctx: RendererContext): Promise<Action[]> {
        if (push.branch !== repo.defaultBranch) {
            return Promise.resolve([]);
        }
        // If the tag is like 0.5.32-stuff, offer to create a tag like 0.5.32
        const version = this.versionPrefix(tag.name);
        if (version) {
            return ctx.context.graphClient.query<graphql.TagByName.Query, graphql.TagByName.Variables>({
                name: "tagByName",
                variables: {
                    repo: repo.name,
                    owner: repo.owner,
                    name: version,
                },
                options: QueryNoCacheOptions,
            })
                .then(result => {
                    const et = _.get(result, "Tag[0].name");
                    if (!et) {
                        if (this.isLastTagOfVersion(push, tag, version)) {

                            const tagHandler = new CreateGitHubTag();
                            tagHandler.tag = version;
                            tagHandler.message = push.after.message || "Tag created by Atomist GitHub Notifications Skill";
                            tagHandler.sha = push.after.sha;
                            tagHandler.repo = repo.name;
                            tagHandler.owner = repo.owner;
                            tagHandler.apiUrl = repo.org.provider.apiUrl;

                            return [buttonForCommand(
                                {
                                    text: `Tag ${version}`,
                                    role: "global",
                                },
                                tagHandler)];
                        }
                    }
                    return [];
                });
        }
        return Promise.resolve([]);
    }

    private versionPrefix(tagName: string): string | undefined {
        if (semver.valid(tagName)) {
            return `${semver.major(tagName)}.${semver.minor(tagName)}.${semver.patch(tagName)}`;
        }
        return undefined;
    }

    private isLastTagOfVersion(push: graphql.PushToPushLifecycle.Push,
                               tag: graphql.PushFields.Tags,
                               version: string): boolean {
        const sortedTagNamesWithThisVersion = sortTagsByName(push.after.tags)
            .filter(t => this.versionPrefix(t.name) === version)
            .map(t => t.name);
        return sortedTagNamesWithThisVersion.indexOf(tag.name) === (sortedTagNamesWithThisVersion.length - 1);
    }
}

export class PullRequestActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<graphql.PushToPushLifecycle.Push> {

    constructor() {
        super(LifecycleActionPreferences.push.raise_pullrequest.id);
    }

    public supports(node: any): boolean {
        if (node.after) {
            const push = node as graphql.PushToPushLifecycle.Push;
            return push.branch !== (push.repo.defaultBranch || "master")
                && push.branch !== "gh-pages";
            // && (!push.builds || !push.builds.some(b => b.status !== "passed")
            // && (!push.goals || !lastGoalSet(push.goals || []).some(g => g.state !== SdmGoalState.success)));
        } else {
            return false;
        }
    }

    public buttonsFor(node: graphql.PushToPushLifecycle.Push, ctx: RendererContext): Promise<Action[]> {
        if (ctx.rendererId === "commit") {
            const repo = ctx.lifecycle.extract("repo");

            return ctx.context.graphClient.query<graphql.Branch.Query, graphql.Branch.Variables>({
                name: "branch",
                variables: {
                    repo: repo.name,
                    owner: repo.owner,
                    branch: node.branch,
                },
                options: QueryNoCacheOptions,
            })
                .then(result => {
                    let showButton = true;
                    const buttons = [];

                    // If there are open PRs on the branch, don't show the button
                    const branch = _.get(result, "Repo[0].branches[0]");

                    // If there are PRs that already contain this push's after commit, don't show the button
                    if (branch && !!branch.pullRequests
                        && branch.pullRequests.filter((pr: any) => pr.state === "open").length > 0) {
                        showButton = false;
                    } else if (branch && !!branch.pullRequests) {
                        branch.pullRequests.forEach((pr: any) => {
                            if (pr.commits.filter((c: any) => c.sha === node.after.sha).length > 0) {
                                showButton = false;
                            }
                        });
                    }

                    if (showButton) {
                        const msg = node.after.message.split("\n");
                        let body = null;
                        if (msg.length > 1) {
                            body = msg.slice(1).join("\n").split("\r\n").join("\n").split("\r").join("");
                        }

                        buttons.push(buttonForCommand(
                            {
                                text: "Raise PR",
                                role: "global",
                            },
                            "RaiseGitHubPullRequest", {
                                org: repo.owner,
                                repo: repo.name,
                                title: msg[0],
                                body,
                                base: node.repo.defaultBranch,
                                head: node.branch,
                                apiUrl: repo.org.provider.apiUrl,
                            }));
                    }
                    return buttons;
                })
                .catch(err => {
                    logger.error("Error occurred running GraphQL query: %s", err);
                    return [];
                });
        } else {
            return Promise.resolve([]);
        }
    }

    public menusFor(node: graphql.PushToPushLifecycle.Push, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }
}

export class CancelGoalSetActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<GoalSet> {

    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super(LifecycleActionPreferences.push.cancel_goal_set.id);
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        return node.goals && node.goalSetId;
    }

    public async buttonsFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        const buttons = [];

        if (context.rendererId === "goals" && !!goalSet && !!goalSet.goals) {
            if (goalSet && goalSet.goals) {
                const goals = lastGoalSet(goalSet.goals).sort((g1, g2) => g1.name.localeCompare(g2.name));
                const push = context.lifecycle.extract("push") as PushFields.Fragment;

                // Add cancel button for in-flight goal sets
                if (isFullRenderingEnabled(this.renderingStyle, context) && goals.some(g =>
                    [SdmGoalState.in_process,
                        SdmGoalState.requested,
                        SdmGoalState.planned,
                        SdmGoalState.waiting_for_approval,
                        SdmGoalState.approved,
                        SdmGoalState.waiting_for_pre_approval,
                        SdmGoalState.pre_approved].includes(g.state))) {

                    buttons.push(buttonForCommand({
                        text: "Cancel",
                        confirm: {
                            title: "Cancel Goal Set",
                            text: `Do you really want to cancel goal set ${goalSet.goalSetId.slice(0, 7)} on commit ${
                                push.after.sha.slice(0, 7)} of ${push.repo.owner}/${push.repo.name}?`,
                            dismiss_text: "No",
                            ok_text: "Yes",
                        },
                    }, "CancelGoalSets", { goalSetId: goalSet.goalSetId }));
                }
            }
        }

        return Promise.resolve(buttons);
    }

    public menusFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }
}

export class ApproveGoalActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<GoalSet> {

    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super(LifecycleActionPreferences.push.approve_goal.id);
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        return node.goals && node.goalSetId;
    }

    public async buttonsFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        const buttons: Action[] = [];

        if (context.rendererId === "goals") {
            if (goalSet && goalSet.goals) {
                const goals = lastGoalSet(goalSet.goals).sort((g1, g2) => g1.name.localeCompare(g2.name));
                goals.filter(g => g.state === SdmGoalState.failure)
                    .filter(g => g.retryFeasible === true)
                    .forEach(g => this.createButton(SdmGoalState.requested, "Restart", g, buttons));
                goals.filter(g => g.state === SdmGoalState.waiting_for_pre_approval)
                    .forEach(g => this.createButton(SdmGoalState.pre_approved, "Start", g, buttons));
                goals.filter(g => g.state === SdmGoalState.waiting_for_approval)
                    .forEach(g => this.createButton(SdmGoalState.approved, "Approve", g, buttons));
            }
        }

        return Promise.resolve(buttons);
    }

    public menusFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createButton(state: SdmGoalState,
                         label: string,
                         goal: graphql.PushFields.Goals,
                         buttons: any[]): void {

        // Add the approve button
        const handler = new UpdateSdmGoalState();
        handler.id = goal.id;
        handler.state = state;
        (handler as any).__atomist_github_owner = goal.repo.owner;

        const name = goal.name.replace(/`/g, "");

        buttons.push(buttonForCommand(
            {
                text: `${label} _${name}_`,
                role: "global",
            },
            handler));
    }
}

export class ExpandAttachmentsActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<GoalSet> {

    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super("expand_attachments");
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        return !!node.after;
    }

    public async buttonsFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        const buttons: Action[] = [];
        const push = context.lifecycle.extract("push") as PushFields.Fragment;
        const displayState = _.get(push, "goalsDisplayState[0].state") || SdmGoalDisplayState.show_current;

        const shouldChannelExpand = context.lifecycle.renderers.some(
            r => r.id() === LifecycleRendererPreferences.push.expand.id);
        const displayFormat = _.get(push, "goalsDisplayState[0].format") || this.renderingStyle;

        if (context.rendererId === "expand_attachments" && !shouldChannelExpand) {
            if (this.renderingStyle === SdmGoalDisplayFormat.compact) {
                if (displayFormat === SdmGoalDisplayFormat.full) {
                    this.createButton(
                        displayState,
                        SdmGoalDisplayFormat.compact,
                        `Less \u02C4`,
                        push,
                        buttons);
                } else {
                    this.createButton(
                        displayState,
                        SdmGoalDisplayFormat.full,
                        `More \u02C5`,
                        push,
                        buttons);
                }
            }
        }

        return Promise.resolve(buttons);
    }

    public menusFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createButton(state: SdmGoalDisplayState,
                         format: SdmGoalDisplayFormat,
                         label: string,
                         push: PushFields.Fragment,
                         buttons: any[]): void {

        const handler = new UpdateSdmGoalDisplayState();
        handler.state = state;
        handler.format = format;
        handler.owner = push.repo.owner;
        handler.name = push.repo.name;
        handler.providerId = push.repo.org.provider.providerId;
        handler.branch = push.branch;
        handler.sha = push.after.sha;

        buttons.push(buttonForCommand(
            {
                text: label,
            },
            handler));
    }
}

export class DisplayGoalActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<GoalSet> {

    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super(LifecycleActionPreferences.push.display_goals.id);
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        return node.goals && node.goalSetId;
    }

    public async buttonsFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        const buttons: Action[] = [];
        const goalSets = context.lifecycle.extract("goalSets") as GoalSet[];
        const push = context.lifecycle.extract("push") as PushFields.Fragment;
        const displayState = _.get(push, "goalsDisplayState[0].state") || SdmGoalDisplayState.show_current;
        const displayFormat = _.get(push, "goalsDisplayState[0].format") || this.renderingStyle;
        const goalSetIndex = goalSets.findIndex(gs => gs.goalSetId === goalSet.goalSetId);

        if (context.rendererId === "goals") {
            if (goalSets.length > 1) {
                const count = goalSets.length - 1;

                if (displayState === SdmGoalDisplayState.show_current) {
                    // Show more button
                    this.createButton(
                        SdmGoalDisplayState.show_all,
                        displayFormat,
                        `${count} additional goal ${count > 1 ? "sets" : "set"} \u02C5`,
                        push,
                        buttons);
                } else if (goalSetIndex === goalSets.length - 1) {
                    // Show hide button
                    this.createButton(
                        SdmGoalDisplayState.show_current,
                        displayFormat,
                        `${count} additional goal ${count > 1 ? "sets" : "set"} \u02C4`,
                        push,
                        buttons);
                }
            }
        }

        return Promise.resolve(buttons);
    }

    public menusFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createButton(state: SdmGoalDisplayState,
                         format: SdmGoalDisplayFormat,
                         label: string,
                         push: PushFields.Fragment,
                         buttons: any[]): void {

        const handler = new UpdateSdmGoalDisplayState();
        handler.state = state;
        handler.format = format;
        handler.owner = push.repo.owner;
        handler.name = push.repo.name;
        handler.providerId = push.repo.org.provider.providerId;
        handler.branch = push.branch;
        handler.sha = push.after.sha;

        buttons.push(buttonForCommand(
            {
                text: label,
            },
            handler));
    }
}
