/*
 * Copyright © 2018 Atomist, Inc.
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
    HandlerResult,
    Success,
} from "@atomist/automation-client/lib/HandlerResult";
import { AutoMergeLabel } from "@atomist/sdm-pack-lifecycle/lib/handlers/event/pullrequest/autoMerge";
import { addAutoMergeLabels } from "./AddGitHubPullRequestAutoLabels";
import * as github from "./gitHubApi";

/**
 * Enable Pull Request auto merge.
 */
@ConfigurableCommandHandler("Enable Pull Request auto merge", {
    intent: ["auto merge pr", "auto merge github pr"],
    autoSubmit: true,
})
@Tags("github", "pr", "auto-merge")
export class EnableGitHubPullRequestAutoMerge implements HandleCommand {

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @Parameter({
        displayName: "Pull Request Number",
        description: "number of the pull request number to merge, with no leading `#`",
        pattern: /^.*$/,
        validInput: "an open GitHub pull request number",
        minLength: 1,
        maxLength: 10,
        required: true,
    })
    public issue: number;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    @Secret(Secrets.userToken("repo"))
    public githubToken: string;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        await addAutoMergeLabels(this.owner, this.repo, this.githubToken, this.apiUrl);

        const api = github.api(this.githubToken, this.apiUrl);
        await api.issues.addLabels({
            owner: this.owner,
            repo: this.repo,
            number: this.issue,
            labels: [AutoMergeLabel],
        });

        return Success;
    }

}
