import type { ChatClient, Message } from '@sourcegraph/cody-shared'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AutoeditModelOptions, AutoeditsModelAdapter } from './base'
import { getMaxOutputTokensForAutoedits, getSourcegraphCompatibleChatPrompt } from './utils'

export class SourcegraphChatAdapter implements AutoeditsModelAdapter {
    constructor(private readonly chatClient: ChatClient) {}

    async getModelResponse(option: AutoeditModelOptions): Promise<string> {
        try {
            const maxTokens = getMaxOutputTokensForAutoedits(option.codeToRewrite)
            const messages: Message[] = getSourcegraphCompatibleChatPrompt({
                systemMessage: option.prompt.systemMessage,
                userMessage: option.prompt.userMessage,
            })
            const stream = await this.chatClient.chat(
                messages,
                {
                    model: option.model,
                    maxTokensToSample: maxTokens,
                    temperature: 0.1,
                    prediction: {
                        type: 'content',
                        content: option.codeToRewrite,
                    },
                },
                new AbortController().signal
            )

            let accumulated = ''
            for await (const msg of stream) {
                if (msg.type === 'change') {
                    const newText = msg.text.slice(accumulated.length)
                    accumulated += newText
                } else if (msg.type === 'complete' || msg.type === 'error') {
                    break
                }
            }
            return accumulated
        } catch (error) {
            autoeditsOutputChannelLogger.logError(
                'getModelResponse',
                'Error calling Sourcegraph Chat:',
                {
                    verbose: error,
                }
            )
            throw error
        }
    }
}
