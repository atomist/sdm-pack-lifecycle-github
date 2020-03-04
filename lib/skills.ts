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

import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import {
    AtomistSkillRepoFilterParameterValue,
    ConfiguredSkillsQuery,
    ConfiguredSkillsQueryVariables,
} from "./typings/types";

export async function isSkillEnabled(context: HandlerContext, namespace: string, name: string, repoId?: string): Promise<boolean> {

    const skills = (await context.graphClient.query<ConfiguredSkillsQuery, ConfiguredSkillsQueryVariables>({
        name: "ConfiguredSkills",
    })).skills;

    const skillInstance = skills?.configured?.skills?.find(s => s.namespace === namespace && s.name === name);
    if (!!skillInstance) {
        for (const configuration of skillInstance.configuration.instances.filter(i => i.enabled)) {
            const repoFilter: AtomistSkillRepoFilterParameterValue =
                configuration.parameters.find(p => p.__typename === "AtomistSkillRepoFilterParameterValue") as any;
            if (!!repoFilter) {
                const excludes = repoFilter.value?.excludes || [];
                const includes = repoFilter.value?.includes || [];
                if (includes.some(i => i.repoIds.includes(repoId)) && !excludes.some(e => e.repoIds.includes(repoId))) {
                    return true;
                }
            } else {
                return true;
            }
        }
    }

    return false;
}
