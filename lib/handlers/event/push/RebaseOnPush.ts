import { TokenCredentials } from "@atomist/automation-client";
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
        id: result.id as any,
    };
};

export const GitHubPullRequestCommentUpdater: PullRequestCommentUpdater<GitHubCommentDetails> = async (comment, credentials, body) => {
    return (await api((credentials as TokenCredentials).token, comment.apiUrl).issues.editComment({
        owner: comment.owner,
        repo: comment.repo,
        id: comment.id.toString(),
        body,
    })).data;
};
