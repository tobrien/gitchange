#!/usr/bin/env node
import { Content, createSection, Section } from '@tobrien/minorprompt';
import 'dotenv/config';
import { createCompletion } from '../util/openai';
import * as Diff from '../content/diff';
import * as Prompts from '../prompt/prompts';
import * as Run from '../run';
import * as Chat from '@tobrien/minorprompt/chat';
import { run } from '../util/child';
import { getLogger } from '../logging';
import { ChatCompletionMessageParam } from 'openai/resources';
import shellescape from 'shell-escape';

export const execute = async (runConfig: Run.Config) => {
    const logger = getLogger();
    const prompts = await Prompts.create(runConfig.model as Chat.Model, runConfig);

    const contentSections: Section<Content>[] = [];

    let diffContent = '';

    let cached = runConfig.cached;
    // If cached is undefined? We're going to look for a staged commit; otherwise, we'll use the supplied setting.
    if (runConfig.cached === undefined) {
        cached = await Diff.hasStagedChanges();
    }
    const options = { cached };
    const diff = await Diff.create(options);
    diffContent = await diff.get();

    const diffSection = createSection<Content>('diff');
    diffSection.add(diffContent);
    contentSections.push(diffSection);


    const prompt = await prompts.createCommitPrompt(contentSections);

    const request: Chat.Request = prompts.format(prompt);

    const summary = await createCompletion(request.messages as ChatCompletionMessageParam[], { model: runConfig.model });

    if (runConfig.sendit) {
        logger.info('SendIt mode enabled. Committing with message', summary);
        try {
            const escapedSummary = shellescape([summary]);
            await run(`git commit -m ${escapedSummary}`);
            logger.info('Commit successful!');
        } catch (error) {
            logger.error('Failed to commit:', error);
            process.exit(1);
        }
    }

    return summary;
}
