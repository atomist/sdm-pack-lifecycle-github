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
    Success,
} from "@atomist/automation-client/lib/HandlerResult";
import { replaceChatIdWithGitHubId } from "@atomist/sdm-pack-lifecycle";
import * as github from "./gitHubApi";

@ConfigurableCommandHandler("Raise a GitHub pull request", {
    intent: [ "raise pr", "raise pullrequest",
        "raise github pr", "raise github pullrequest" ],
    autoSubmit: true,
})
@Tags("github", "pr")
export class RaiseGitHubPullRequest implements HandleCommand {

    @Parameter({ description: "pull request title", pattern: /^.*$/ })
    public title: string;

    @Parameter({
        description: "pull request body", pattern: /[\s\S]*/,
        required: false,
    })
    public body: string;

    @Parameter({
        description: "branch the changes should get pulled into",
        pattern: /^.*$/,
    })
    public base: string;

    @Parameter({
        description: "branch containing the changes",
        pattern: /^.*$/,
    })
    public head: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.SlackTeam, false)
    public teamId: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    @Secret(Secrets.userToken("repo"))
    public githubToken: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return replaceChatIdWithGitHubId(this.body, this.teamId, ctx)
            .then(body => {
                return github.api(this.githubToken, this.apiUrl).pulls.create({
                    owner: this.owner,
                    repo: this.repo,
                    title: this.title,
                    body,
                    head: this.head,
                    base: this.base,
                });
            })
            .catch(err => {
                return github.handleError("Raise Pull Request", err, ctx);
            })
            .then(() => Success, failure);
    }
}
