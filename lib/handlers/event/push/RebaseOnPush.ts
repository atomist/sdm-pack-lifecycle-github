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

import { TokenCredentials } from "@atomist/automation-client/lib/operations/common/ProjectOperationCredentials";
import {
    PullRequestCommentCreator,
    PullRequestCommentUpdater,
} from "@atomist/sdm-pack-lifecycle";
import { api } from "../../command/github/gitHubApi";

export interface GitHubCommentDetails {
    apiUrl: string;
    owner: string;
    repo: string;
    number: number;
    id: number;
}

export const GitHubPullRequestCommentCreator: PullRequestCommentCreator<GitHubCommentDetails> = async (pr, credentials, body) => {
    const result = (await api((credentials as TokenCredentials).token, pr.repo.org.provider.apiUrl).issues.createComment({
        owner: pr.repo.owner,
        repo: pr.repo.name,
        number: pr.number,
        body,
    })).data;

    return {
        apiUrl: pr.repo.org.provider.apiUrl,
        owner: pr.repo.owner,
        repo: pr.repo.name,
        number: pr.number,
        id: result.id,
    };
};

export const GitHubPullRequestCommentUpdater: PullRequestCommentUpdater<GitHubCommentDetails> = async (comment, credentials, body) => {
    await api((credentials as TokenCredentials).token, comment.apiUrl).issues.updateComment({
        owner: comment.owner,
        repo: comment.repo,
        comment_id: comment.id,
        body,
    });
};
