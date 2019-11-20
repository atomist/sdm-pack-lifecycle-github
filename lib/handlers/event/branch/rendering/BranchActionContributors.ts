/*
 * Copyright © 2019 Atomist, Inc.
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

import { buttonForCommand } from "@atomist/automation-client";
import {
    AbstractIdentifiableContribution,
    graphql,
    LifecycleActionPreferences,
    RendererContext,
    SlackActionContributor,
} from "@atomist/sdm-pack-lifecycle";
import { Action } from "@atomist/slack-messages";
import { RaiseGitHubPullRequest } from "../../../command/github/RaiseGitHubPullRequest";

export class RaisePrActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<graphql.BranchToBranchLifecycle.Branch> {

    constructor() {
        super(LifecycleActionPreferences.branch.raise_pullrequest.id);
    }

    public supports(node: any): boolean {
        return !!node.commit
            && (!node.pullRequests || (node.pullRequests && node.pullRequests.length === 0));
    }

    public buttonsFor(node: graphql.BranchToBranchLifecycle.Branch, context: RendererContext): Promise<Action[]> {
        const actions = [];
        const deleted = context.lifecycle.extract("deleted");

        if (context.rendererId === "branch" && !deleted) {
            const handler = new RaiseGitHubPullRequest();
            handler.owner = node.repo.owner;
            handler.repo = node.repo.name;
            handler.head = node.name;
            handler.base = node.repo.defaultBranch || "master";
            handler.title = node.commit.message;
            handler.apiUrl = node.repo.org.provider.apiUrl;
            actions.push(buttonForCommand({ text: "Raise PR" }, handler));
        }
        return Promise.resolve(actions);
    }

    public menusFor(node: graphql.BranchToBranchLifecycle.Branch, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }
}
