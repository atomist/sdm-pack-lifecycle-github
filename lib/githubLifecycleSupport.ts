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
    adaptHandleCommand,
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import {
    CardActionContributorWrapper,
    DefaultLifecycleRenderingOptions,
    LifecycleOptions,
    lifecycleSupport,
} from "@atomist/sdm-pack-lifecycle";
import {
    BranchFields,
    IssueFields,
    IssueToIssueCommentLifecycle,
    PullRequestFields,
    PushToPushLifecycle,
    ReviewToReviewLifecycle,
} from "@atomist/sdm-pack-lifecycle/lib/typings/types";
import deepmerge = require("deepmerge");
import { AddGitHubPullRequestAutoLabels } from "./handlers/command/github/AddGitHubPullRequestAutoLabels";
import { AssignGitHubPullRequestReviewer } from "./handlers/command/github/AssignGitHubPullRequestReviewer";
import { AssignToMeGitHubIssue } from "./handlers/command/github/AssignToMeGitHubIssue";
import { CloseGitHubIssue } from "./handlers/command/github/CloseGitHubIssue";
import { CommentGitHubIssue } from "./handlers/command/github/CommentGitHubIssue";
import { CreateGitHubIssue } from "./handlers/command/github/CreateGitHubIssue";
import { CreateGitHubRelease } from "./handlers/command/github/CreateGitHubRelease";
import {
    CreateGitHubTag,
    createGitHubTagSelection,
} from "./handlers/command/github/CreateGitHubTag";
import {
    CreateRelatedGitHubIssue,
    createRelatedGitHubIssueTargetOwnerSelection,
    createRelatedGitHubIssueTargetRepoSelection,
} from "./handlers/command/github/CreateRelatedGitHubIssue";
import { DeleteGitHubBranch } from "./handlers/command/github/DeleteGitHubBranch";
import { DisplayGitHubIssue } from "./handlers/command/github/DisplayGitHubIssue";
import { DisplayGitHubPullRequest } from "./handlers/command/github/DisplayGitHubPullRequest";
import { EnableGitHubPullRequestAutoMerge } from "./handlers/command/github/EnableGitHubPullRequestAutoMerge";
import { EnableGitHubPullRequestAutoRebase } from "./handlers/command/github/EnableGitHubPullRequestAutoRebase";
import {
    LinkRelatedGitHubIssue,
    linkRelatedGitHubIssueTargetIssueSelection,
    linkRelatedGitHubIssueTargetOwnerSelection,
    linkRelatedGitHubIssueTargetRepoSelection,
} from "./handlers/command/github/LinkRelatedGitHubIssue";
import { ListMyGitHubIssues } from "./handlers/command/github/ListMyGitHubIssues";
import { MergeGitHubPullRequest } from "./handlers/command/github/MergeGitHubPullRequest";
import {
    MoveGitHubIssue,
    moveGitHubIssueTargetOwnerSelection,
    moveGitHubIssueTargetRepoSelection,
} from "./handlers/command/github/MoveGitHubIssue";
import { RaiseGitHubPullRequest } from "./handlers/command/github/RaiseGitHubPullRequest";
import { ReactGitHubIssue } from "./handlers/command/github/ReactGitHubIssue";
import { ReactGitHubIssueComment } from "./handlers/command/github/ReactGitHubIssueComment";
import { ReopenGitHubIssue } from "./handlers/command/github/ReopenGitHubIssue";
import { SearchGitHubRepositoryIssues } from "./handlers/command/github/SearchGitHubRepositoryIssues";
import { ToggleLabelGitHubIssue } from "./handlers/command/github/ToggleLabelGitHubIssue";
import { RaisePrActionContributor } from "./handlers/event/branch/rendering/BranchActionContributors";
import * as ca from "./handlers/event/comment/rendering/CommentActionContributors";
import * as ia from "./handlers/event/issue/rendering/IssueActionContributors";
import * as pra from "./handlers/event/pullrequest/rendering/PullRequestActionContributors";
import {
    GitHubPullRequestCommentCreator,
    GitHubPullRequestCommentUpdater,
} from "./handlers/event/push/RebaseOnPush";
import * as pa from "./handlers/event/push/rendering/PushActionContributors";
import * as rra from "./handlers/event/review/rendering/ReviewActionContributors";

export const DefaultGitHubLifecycleOptions: LifecycleOptions = deepmerge(DefaultLifecycleRenderingOptions, {
    branch: {
        chat: {
            actions: [
                (repo: BranchFields.Repo) => !repo.org.provider.private ? [
                    new RaisePrActionContributor(),
                ] : [],
            ],
        },
    },
    comment: {
        chat: {
            actions: [
                (repo: IssueToIssueCommentLifecycle.Repo) => !repo.org.provider.private ? [
                    new ca.AssignActionContributor(),
                    new ca.CommentActionContributor(),
                    new ca.LabelActionContributor(),
                    new ca.ReactionActionContributor(),
                    new ca.CloseActionContributor(),
                    new ca.DetailsActionContributor(),
                ] : [],
            ],
        },
    },
    issue: {
        chat: {
            actions: [
                (repo: IssueFields.Repo) => !repo.org.provider.private ? [
                    new ia.CommentActionContributor(),
                    new ia.LabelActionContributor(),
                    new ia.ReactionActionContributor(),
                    new ia.AssignToMeActionContributor(),
                    new ia.AssignActionContributor(),
                    new ia.MoveActionContributor(),
                    new ia.RelatedActionContributor(),
                    new ia.ReopenActionContributor(),
                    new ia.CloseActionContributor(),
                    new ia.DisplayMoreActionContributor(),
                ] : [],
            ],
        },
        web: {
            actions: [
                (repo: IssueFields.Repo) => !repo.org.provider.private ? [
                    new CardActionContributorWrapper(new ia.CommentActionContributor()),
                    new CardActionContributorWrapper(new ia.ReactionActionContributor()),
                    new CardActionContributorWrapper(new ia.LabelActionContributor()),
                    new CardActionContributorWrapper(new ia.AssignToMeActionContributor("issue")),
                    new CardActionContributorWrapper(new ia.AssignActionContributor("issue")),
                    new CardActionContributorWrapper(new ia.CloseActionContributor()),
                    new CardActionContributorWrapper(new ia.ReopenActionContributor()),
                ] : [],
            ],
        },
    },
    pullRequest: {
        chat: {
            actions: [
                (repo: PullRequestFields.Repo) => !repo.org.provider.private ? [
                    new pra.MergeActionContributor(),
                    new pra.AssignReviewerActionContributor(),
                    new pra.AutoMergeActionContributor(),
                    new pra.AutoRebaseActionContributor(),
                    new pra.CommentActionContributor(),
                    new pra.ThumbsUpActionContributor(),
                    new pra.ApproveActionContributor(),
                    new pra.DeleteActionContributor(),
                ] : [],
            ],
        },
        web: {
            actions: [
                (repo: PullRequestFields.Repo) => !repo.org.provider.private ? [
                    new CardActionContributorWrapper(new pra.MergeActionContributor()),
                    new CardActionContributorWrapper(new pra.AssignReviewerActionContributor()),
                    new CardActionContributorWrapper(new pra.AutoMergeActionContributor()),
                    new CardActionContributorWrapper(new pra.AutoRebaseActionContributor()),
                    new CardActionContributorWrapper(new pra.CommentActionContributor()),
                    new CardActionContributorWrapper(new pra.ThumbsUpActionContributor()),
                    new CardActionContributorWrapper(new pra.ApproveActionContributor()),
                    new CardActionContributorWrapper(new pra.DeleteActionContributor()),
                ] : [],
            ],
        },
        rebase: {
            commentCreator: GitHubPullRequestCommentCreator,
            commentUpdater: GitHubPullRequestCommentUpdater,
        },
    },
    push: {
        chat: {
            actions: [
                (push: PushToPushLifecycle.Push) => !push.repo.org.provider.private ? [
                    new pa.TagPushActionContributor(),
                    new pa.TagTagActionContributor(),
                    new pa.ReleaseActionContributor(),
                    new pa.PullRequestActionContributor(),
                    new pa.ApproveGoalActionContributor(),
                    new pa.CancelGoalSetActionContributor(),
                    new pa.DisplayGoalActionContributor(),
                    new pa.ExpandAttachmentsActionContributor(),
                ] : [
                    new pa.ApproveGoalActionContributor(),
                    new pa.CancelGoalSetActionContributor(),
                    new pa.DisplayGoalActionContributor(),
                    new pa.ExpandAttachmentsActionContributor(),
                ],
            ],
        },
        web: {
            actions: [
                (push: PushToPushLifecycle.Push) => !push.repo.org.provider.private ? [
                    new CardActionContributorWrapper(new pa.TagPushActionContributor()),
                    new CardActionContributorWrapper(new pa.TagTagActionContributor()),
                    new CardActionContributorWrapper(new pa.ReleaseActionContributor()),
                    new CardActionContributorWrapper(new pa.PullRequestActionContributor()),
                    new CardActionContributorWrapper(new pa.ApproveGoalActionContributor()),
                    new CardActionContributorWrapper(new pa.CancelGoalSetActionContributor()),
                ] : [
                    new CardActionContributorWrapper(new pa.ApproveGoalActionContributor()),
                    new CardActionContributorWrapper(new pa.CancelGoalSetActionContributor()),
                ],
            ],
        },
    },
    review: {
        chat: {
            actions: [
                (repo: ReviewToReviewLifecycle.Repo) => !repo.org.provider.private ? [
                    new rra.CommentActionContributor(),
                ] : [],
            ],
        },
    },
    commands: [
        adaptHandleCommand(AddGitHubPullRequestAutoLabels),
        adaptHandleCommand(AssignGitHubPullRequestReviewer),
        adaptHandleCommand(AssignToMeGitHubIssue),
        adaptHandleCommand(CloseGitHubIssue),
        adaptHandleCommand(CommentGitHubIssue),
        adaptHandleCommand(CreateGitHubIssue),
        adaptHandleCommand(CreateGitHubRelease),
        adaptHandleCommand(CreateGitHubTag),
        adaptHandleCommand(createGitHubTagSelection),
        adaptHandleCommand(CreateRelatedGitHubIssue),
        adaptHandleCommand(createRelatedGitHubIssueTargetOwnerSelection),
        adaptHandleCommand(createRelatedGitHubIssueTargetRepoSelection),
        adaptHandleCommand(DeleteGitHubBranch),
        adaptHandleCommand(DisplayGitHubIssue),
        adaptHandleCommand(DisplayGitHubPullRequest),
        adaptHandleCommand(EnableGitHubPullRequestAutoMerge),
        adaptHandleCommand(EnableGitHubPullRequestAutoRebase),
        adaptHandleCommand(LinkRelatedGitHubIssue),
        adaptHandleCommand(linkRelatedGitHubIssueTargetOwnerSelection),
        adaptHandleCommand(linkRelatedGitHubIssueTargetRepoSelection),
        adaptHandleCommand(linkRelatedGitHubIssueTargetIssueSelection),
        adaptHandleCommand(ListMyGitHubIssues),
        adaptHandleCommand(MergeGitHubPullRequest),
        adaptHandleCommand(MoveGitHubIssue),
        adaptHandleCommand(moveGitHubIssueTargetOwnerSelection),
        adaptHandleCommand(moveGitHubIssueTargetRepoSelection),
        adaptHandleCommand(RaiseGitHubPullRequest),
        adaptHandleCommand(ReactGitHubIssue),
        adaptHandleCommand(ReactGitHubIssueComment),
        adaptHandleCommand(ReopenGitHubIssue),
        adaptHandleCommand(SearchGitHubRepositoryIssues),
        adaptHandleCommand(ToggleLabelGitHubIssue),
    ],
});

export function githubLifecycleSupport(): ExtensionPack {
    return {
        ...metadata(),
        configure: sdm => {
            sdm.addExtensionPacks(lifecycleSupport(DefaultGitHubLifecycleOptions));
        },
    };
}
