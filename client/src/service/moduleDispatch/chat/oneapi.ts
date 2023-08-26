import type { NextApiResponse } from 'next';
import { sseResponse } from '@/service/utils/tools';
import { OpenAiChatEnum } from '@/constants/model';
import { adaptChatItem_openAI, countOpenAIToken } from '@/utils/plugin/openai';
import { modelToolMap } from '@/utils/plugin';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType, QuoteItemType } from '@/types/chat';
import type { ChatHistoryItemResType } from '@/types/chat';
import { ChatModuleEnum, ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { SSEParseData, parseStreamChunk } from '@/utils/sse';
import { textAdaptGptResponse } from '@/utils/adapt';
import { getAIChatApi, axiosConfig } from '@/service/ai/openai';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { getChatModel } from '@/service/utils/data';
import { countModelPrice } from '@/service/events/pushBill';
import { ChatModelItemType } from '@/types/model';
import { UserModelSchema } from '@/types/mongoSchema';
import { textCensor } from '@/api/service/plugins';
import { ChatCompletionRequestMessageRoleEnum } from 'openai';
import { AppModuleItemType } from '@/types/app';

export type ChatProps = {
  res: NextApiResponse;
  model: `${OpenAiChatEnum}`;
  temperature?: number;
  maxToken?: number;
  history?: ChatItemType[];
  userChatInput: string;
  stream?: boolean;
  detail?: boolean;
  quoteQA?: QuoteItemType[];
  systemPrompt?: string;
  limitPrompt?: string;
  userOpenaiAccount: UserModelSchema['openaiAccount'];
  outputs: AppModuleItemType['outputs'];
};
export type ChatResponse = {
  [TaskResponseKeyEnum.answerText]: string;
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
  finish: boolean;
};

/* request openai chat */
export const dispatchChatCompletion = async (props: Record<string, any>): Promise<ChatResponse> => {
  let {
    res,
    model,
    temperature = 0,
    maxToken = 4000,
    stream = false,
    detail = false,
    history = [],
    quoteQA = [],
    userChatInput,
    systemPrompt = '',
    limitPrompt = '',
    userOpenaiAccount,
    outputs
  } = props as ChatProps;
  if (!userChatInput) {
    return Promise.reject('Question is empty');
  }

  // temperature adapt
  const modelConstantsData = getChatModel(model);

  if (!modelConstantsData) {
    return Promise.reject('The chat model is undefined, you need to select a chat model.');
  }

  const { filterQuoteQA, quotePrompt } = filterQuote({
    quoteQA,
    model: modelConstantsData
  });

  if (modelConstantsData.censor) {
    await textCensor({
      text: `${systemPrompt}
      ${quotePrompt}
      ${limitPrompt}
      ${userChatInput}
      `
    });
  }

  const { messages, filterMessages } = getChatMessages({
    model: modelConstantsData,
    history,
    quotePrompt,
    userChatInput,
    systemPrompt,
    limitPrompt
  });
  const { max_tokens } = getMaxTokens({
    model: modelConstantsData,
    maxToken,
    filterMessages
  });
  // console.log(messages);

  // FastGpt temperature range: 1~10
  temperature = +(modelConstantsData.maxTemperature * (temperature / 10)).toFixed(2);
  temperature = Math.max(temperature, 0.01);
  const chatAPI = getAIChatApi(userOpenaiAccount);

  const response = await chatAPI.createChatCompletion(
    {
      model,
      temperature,
      max_tokens,
      messages: [
        ...(modelConstantsData.defaultSystem
          ? [
              {
                role: ChatCompletionRequestMessageRoleEnum.System,
                content: modelConstantsData.defaultSystem
              }
            ]
          : []),
        ...messages
      ],
      // frequency_penalty: 0.5, // 越大，重复内容越少
      // presence_penalty: -0.5, // 越大，越容易出现新内容
      stream
    },
    {
      timeout: stream ? 60000 : 480000,
      responseType: stream ? 'stream' : 'json',
      ...axiosConfig(userOpenaiAccount)
    }
  );

  const { answerText, totalTokens, completeMessages } = await (async () => {
    if (stream) {
      // sse response
      const { answer } = await streamResponse({
        res,
        detail,
        response
      });
      // count tokens
      const completeMessages = filterMessages.concat({
        obj: ChatRoleEnum.AI,
        value: answer
      });

      const totalTokens = countOpenAIToken({
        messages: completeMessages
      });

      targetResponse({ res, detail, outputs });

      return {
        answerText: answer,
        totalTokens,
        completeMessages
      };
    } else {
      const answer = stream ? '' : response.data.choices?.[0].message?.content || '';
      const totalTokens = stream ? 0 : response.data.usage?.total_tokens || 0;

      const completeMessages = filterMessages.concat({
        obj: ChatRoleEnum.AI,
        value: answer
      });

      return {
        answerText: answer,
        totalTokens,
        completeMessages
      };
    }
  })();

  return {
    [TaskResponseKeyEnum.answerText]: answerText,
    [TaskResponseKeyEnum.responseData]: {
      moduleName: ChatModuleEnum.AIChat,
      price: userOpenaiAccount?.key ? 0 : countModelPrice({ model, tokens: totalTokens }),
      model: modelConstantsData.name,
      tokens: totalTokens,
      question: userChatInput,
      answer: answerText,
      maxToken: max_tokens,
      quoteList: filterQuoteQA,
      completeMessages
    },
    finish: true
  };
};

function filterQuote({
  quoteQA = [],
  model
}: {
  quoteQA: ChatProps['quoteQA'];
  model: ChatModelItemType;
}) {
  const sliceResult = modelToolMap.tokenSlice({
    model: model.model,
    maxToken: model.quoteMaxToken,
    messages: quoteQA.map((item) => ({
      obj: ChatRoleEnum.System,
      value: item.a ? `${item.q}\n${item.a}` : item.q
    }))
  });

  // slice filterSearch
  const filterQuoteQA = quoteQA.slice(0, sliceResult.length);

  const quotePrompt =
    filterQuoteQA.length > 0
      ? `"""${filterQuoteQA
          .map((item) => (item.a ? `[${item.q}\n${item.a}]` : `${item.q}`))
          .join('\n\n')}"""`
      : '';

  return {
    filterQuoteQA,
    quotePrompt
  };
}
function getChatMessages({
  quotePrompt,
  history = [],
  systemPrompt,
  limitPrompt,
  userChatInput,
  model
}: {
  quotePrompt: string;
  history: ChatProps['history'];
  systemPrompt: string;
  limitPrompt: string;
  userChatInput: string;
  model: ChatModelItemType;
}) {
  const limitText = (() => {
    if (!quotePrompt) {
      return limitPrompt;
    }
    const defaultPrompt =
      '三引号引用的内容是你的补充知识，它们是最新的，根据引用内容来回答我的问题。';
    if (limitPrompt) {
      return `${defaultPrompt}${limitPrompt}`;
    }
    return `${defaultPrompt}你仅回答引用包含的内容，如果问题不包含在引用中，你直接回复: "你的问题没有在知识库中体现"`;
  })();

  const messages: ChatItemType[] = [
    ...(systemPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: systemPrompt
          }
        ]
      : []),
    ...(quotePrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: quotePrompt
          }
        ]
      : []),
    ...history,
    ...(limitText
      ? [
          {
            obj: ChatRoleEnum.System,
            value: limitText
          }
        ]
      : []),
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    }
  ];

  const filterMessages = ChatContextFilter({
    model: model.model,
    prompts: messages,
    maxTokens: Math.ceil(model.contextMaxToken - 300) // filter token. not response maxToken
  });

  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages, reserveId: false });

  return {
    messages: adaptMessages,
    filterMessages
  };
}
function getMaxTokens({
  maxToken,
  model,
  filterMessages = []
}: {
  maxToken: number;
  model: ChatModelItemType;
  filterMessages: ChatProps['history'];
}) {
  const tokensLimit = model.contextMaxToken;
  /* count response max token */

  const promptsToken = modelToolMap.countTokens({
    model: model.model,
    messages: filterMessages
  });
  maxToken = maxToken + promptsToken > tokensLimit ? tokensLimit - promptsToken : maxToken;

  return {
    max_tokens: maxToken
  };
}

function targetResponse({
  res,
  outputs,
  detail
}: {
  res: NextApiResponse;
  outputs: AppModuleItemType['outputs'];
  detail: boolean;
}) {
  const targets =
    outputs.find((output) => output.key === TaskResponseKeyEnum.answerText)?.targets || [];

  if (targets.length === 0) return;
  sseResponse({
    res,
    event: detail ? sseResponseEventEnum.answer : undefined,
    data: textAdaptGptResponse({
      text: '\n'
    })
  });
}

async function streamResponse({
  res,
  detail,
  response
}: {
  res: NextApiResponse;
  detail: boolean;
  response: any;
}) {
  let answer = '';
  let error: any = null;
  const parseData = new SSEParseData();

  try {
    for await (const chunk of response.data as any) {
      if (res.closed) break;
      const parse = parseStreamChunk(chunk);
      parse.forEach((item) => {
        const { data } = parseData.parse(item);
        if (!data || data === '[DONE]') return;

        const content: string = data?.choices?.[0]?.delta?.content || '';
        error = data.error;
        answer += content;

        sseResponse({
          res,
          event: detail ? sseResponseEventEnum.answer : undefined,
          data: textAdaptGptResponse({
            text: content
          })
        });
      });
    }
  } catch (error) {
    console.log('pipe error', error);
  }

  if (error) {
    console.log(error);
    return Promise.reject(error);
  }

  return {
    answer
  };
}
