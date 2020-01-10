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
    Secret,
    Secrets,
    Tags,
} from "@atomist/automation-client/lib/decorators";
import { HandleCommand } from "@atomist/automation-client/lib/HandleCommand";
import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import {
    HandlerResult,
    Success,
} from "@atomist/automation-client/lib/HandlerResult";
import {
    AutoMergeCheckSuccessLabel,
    AutoMergeLabel,
    AutoMergeMethodLabel,
    AutoMergeMethods,
} from "@atomist/sdm-pack-lifecycle/lib/handlers/event/pullrequest/autoMerge";
import { slackSuccessMessage } from "@atomist/sdm/lib/api-helper/misc/slack/messages";
import { bold } from "@atomist/slack-messages";
import * as Github from "@octokit/rest";
import * as github from "./gitHubApi";

export const AutoRebaseOnPushLabel = "auto-rebase:on-push";

/**
 * Add Pull Request auto merge and rebase labels.
 */
@ConfigurableCommandHandler("Add Pull Request auto merge and rebase labels", {
    intent: ["add pr labels", "add auto merge labels"],
    autoSubmit: true,
})
@Tags("github", "pr", "auto-merge", "auto-rebase")
export class AddGitHubPullRequestAutoLabels implements HandleCommand {

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    @Secret(Secrets.userToken("repo"))
    public githubToken: string;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        await addAutoMergeLabels(this.owner, this.repo, this.githubToken, this.apiUrl);
        await addAutoRebaseLabels(this.owner, this.repo, this.githubToken, this.apiUrl);

        await ctx.messageClient.respond(slackSuccessMessage(
            "Auto Merge",
            `Successfully added auto merge and rebase labels to ${bold(`${this.owner}/${this.repo}`)}`));
        return Success;
    }
}

export async function addAutoMergeLabels(owner: string,
                                         repo: string,
                                         token: string,
                                         apiUrl: string): Promise<HandlerResult> {
    const api = github.api(token, apiUrl);

    await addLabel(AutoMergeLabel, "277D7D", owner, repo, api);
    await addLabel(AutoMergeCheckSuccessLabel, "277D7D", owner, repo, api);

    AutoMergeMethods.forEach(
        async mm =>
            addLabel(`${AutoMergeMethodLabel}${mm}`, "1C334B", owner, repo, api));

    return Success;
}

export async function addAutoRebaseLabels(owner: string,
                                          repo: string,
                                          token: string,
                                          apiUrl: string): Promise<HandlerResult> {
    const api = github.api(token, apiUrl);
    await addLabel(AutoRebaseOnPushLabel, "0E8A16", owner, repo, api);
    return Success;
}

async function addLabel(name: string,
                        color: string,
                        owner: string,
                        repo: string,
                        api: Github): Promise<void> {
    try {
        await api.issues.getLabel({
            name,
            repo,
            owner,
        });
    } catch (err) {
        await api.issues.createLabel({
            owner,
            repo,
            name,
            color,
        });
    }
}
