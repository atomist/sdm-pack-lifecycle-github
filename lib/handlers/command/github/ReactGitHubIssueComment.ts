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
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    Secret,
    Secrets,
    Success,
    Tags,
} from "@atomist/automation-client";
import { ConfigurableCommandHandler } from "@atomist/automation-client/lib/decorators";
import { HandleCommand } from "@atomist/automation-client/lib/HandleCommand";
import * as github from "./gitHubApi";

@ConfigurableCommandHandler("React to a GitHub comment", {
    intent: [ "react issue comment", "react github issue comment" ],
    autoSubmit: true,
})
@Tags("github", "comment", "reaction")
export class ReactGitHubIssueComment implements HandleCommand {

    @Parameter({ description: "reaction to add", pattern: /^\+1|-1|laugh|confused|heart|hooray$/ })
    public reaction: "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray";

    @Parameter({ description: "The comment number", pattern: /^.*$/ })
    public comment: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    @Secret(Secrets.userToken("repo"))
    public githubToken: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return github.api(this.githubToken, this.apiUrl).reactions.createForIssueComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: +this.comment,
            content: this.reaction,
        })
            .then(() => Success)
            .catch(err => ({ code: 1, message: err.message, stack: err.stack }));
    }
}
