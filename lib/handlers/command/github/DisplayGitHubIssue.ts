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

import {
    ConfigurableCommandHandler,
    MappedParameter,
    MappedParameters,
    Parameter,
    Secret,
    Secrets,
    Tags,
} from "@atomist/automation-client/lib/decorators";
import { HandleCommand } from "@atomist/automation-client/lib/HandleCommand";
import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import {
    failure,
    HandlerResult,
} from "@atomist/automation-client/lib/HandlerResult";
import {
    graphql,
    Lifecycle,
} from "@atomist/sdm-pack-lifecycle";
import { IssueLifecycleHandler } from "@atomist/sdm-pack-lifecycle/lib/handlers/event/issue/IssueLifecycle";
import { issueToIssueLifecycle } from "@atomist/sdm-pack-lifecycle/lib/handlers/event/issue/IssueToIssueLifecycle";
import { chatTeamsToPreferences } from "@atomist/sdm-pack-lifecycle/lib/lifecycle/util";
import * as _ from "lodash";
import { DefaultGitHubLifecycleOptions } from "../../../githubLifecycleSupport";
import * as github from "./gitHubApi";

@ConfigurableCommandHandler("Display an issue on GitHub", {
    intent: ["show issue", "show github issue"],
    autoSubmit: true,
})
@Tags("github", "issue")
export class DisplayGitHubIssue implements HandleCommand {

    @Parameter({ description: "issue number", pattern: /^.*$/ })
    public issue: number;

    @Parameter({ description: "show more", required: false, displayable: false })
    public showMore: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public channelName: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @Secret(Secrets.userToken("repo"))
    public githubToken: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return ctx.graphClient.query<graphql.Issue.Query, graphql.Issue.Variables>({
            name: "issue",
            variables: {
                teamId: this.teamId,
                repoName: this.repo,
                issueName: this.issue.toString(),
                orgOwner: this.owner,
            },
        })
            .then(result => {
                const issues: graphql.Issue.Issue[] =
                    _.cloneDeep(_.get(result, "ChatTeam[0].team.orgs[0].repo[0].issue"));
                const handler = issueToIssueLifecycle(DefaultGitHubLifecycleOptions.issue.chat,
                    () => new ResponseIssueToIssueLifecycle(this.showMore)).listener;

                const channels = [{
                    name: this.channelName,
                    team: {
                        id: this.teamId,
                    },
                }];

                // Hopefully we can find the issue in Neo
                if (issues && issues.length > 0) {
                    // Overwrite the channels to send this message to
                    issues.forEach(i => i.repo.channels = channels);

                    return handler({
                        data: { Issue: issues as any },
                        extensions: { operationName: "DisplayGitHubIssue" },
                        secrets: [{ uri: Secrets.OrgToken, value: this.githubToken }],
                    }, ctx, { orgToken: this.githubToken });
                } else {
                    // If not in Neo, let's get if from GitHub
                    return github.api(this.githubToken, this.apiUrl).issues.get({
                        number: this.issue,
                        repo: this.repo,
                        owner: this.owner,
                    })
                        .then(gis => {
                            const gi = gis.data;
                            const issue: graphql.Issue.Issue = {
                                repo: {
                                    name: this.repo,
                                    owner: this.owner,
                                    channels,
                                    org: {
                                        provider: {
                                            private: false,
                                        } as any,
                                    },
                                },
                                name: this.issue.toString(),
                                number: this.issue,
                                title: gi.title,
                                body: gi.body,
                                state: gi.state as any,
                                labels: gi.labels.map((l: any) => ({ name: l.name })) || [],
                                createdAt: gi.created_at,
                                updatedAt: gi.updated_at,
                                closedAt: gi.closed_at,
                                assignees: gi.assignees.map((a: any) => ({ login: a.login })) || [],
                                openedBy: {
                                    login: gi.user.login,
                                },
                                resolvingCommits: [],
                            };
                            return handler({
                                data: { Issue: [issue] as any },
                                extensions: { operationName: "DisplayGitHubIssue" },
                            }, ctx, { orgToken: this.githubToken });
                        });
                }
            })
            .catch(failure);
    }
}

class ResponseIssueToIssueLifecycle extends IssueLifecycleHandler<graphql.IssueToIssueLifecycle.Subscription> {

    constructor(private readonly showMore: string) {
        super(e => {
                const issue = e.data.Issue[0];
                const repo = e.data.Issue[0].repo;
                return [issue, repo, Date.now().toString()];
            },
            e => chatTeamsToPreferences(_.get(e, "data.Issue[0].repo.org.team.chatTeams")),
            DefaultGitHubLifecycleOptions.issue.chat);
    }

    protected processLifecycle(lifecycle: Lifecycle, store: Map<string, any>): Lifecycle {
        if (this.showMore === "more_+" || this.showMore === "assign_+") {
            store.set("show_more", true);
        } else if (this.showMore === "more_-" || this.showMore === "assign_-") {
            // don't do anything
        } else {
            lifecycle.post = "always";
        }

        return lifecycle;
    }
}
