import {
  WebhookBlock,
  ZapierBlock,
  MakeComBlock,
  FlowwiseBlock,
  PabblyConnectBlock,
  SessionState,
  Webhook,
  Variable,
  WebhookResponse,
  WebhookOptions,
  defaultWebhookAttributes,
  KeyValue,
  ReplyLog,
  ExecutableWebhook,
  AnswerInSessionState,
} from '@typebot.io/schemas'
import { stringify } from 'qs'
import { omit } from '@typebot.io/lib'
import { getDefinedVariables, parseAnswers } from '@typebot.io/lib/results'
import got, { Method, HTTPError, OptionsInit } from 'got'
import { resumeWebhookExecution } from './resumeWebhookExecution'
import { HttpMethod } from '@typebot.io/schemas/features/blocks/integrations/webhook/enums'
import { ExecuteIntegrationResponse } from '../../../types'
import { parseVariables } from '../../../variables/parseVariables'
import prisma from '@typebot.io/lib/prisma'

type ParsedWebhook = ExecutableWebhook & {
  basicAuth: { username?: string; password?: string }
  isJson: boolean
}

export const executeWebhookBlock = async (
  state: SessionState,
  block: WebhookBlock | ZapierBlock | MakeComBlock | PabblyConnectBlock | FlowwiseBlock
): Promise<ExecuteIntegrationResponse> => {
  console.log("execute webhook called state ", JSON.stringify(state));
  console.log("execute webhook called block",JSON.stringify(block));
  // if  ( block.type == "Flow Wise" && block.options && block.options.webhook ) {
  //   console.log("entered ifff for flowwiseee",state.typebotsQueue[0].answers[0].value);
  //   // @ts-ignore
  //   block.options.webhook.body = {
  //     question : state.typebotsQueue[0].answers[0].value
  //   }
  // }
  const logs: ReplyLog[] = []
  const webhook =
    block.options.webhook ??
    ((await prisma.webhook.findUnique({
      where: { id: block.webhookId },
    })) as Webhook | null)
  if (!webhook) {
    logs.push({
      status: 'error',
      description: `Couldn't find webhook with id ${block.webhookId}`,
    })
    return { outgoingEdgeId: block.outgoingEdgeId, logs }
  }
  const preparedWebhook = prepareWebhookAttributes(webhook, block.options)
  const parsedWebhook = await parseWebhookAttributes(
    state,
    state.typebotsQueue[0].answers ,
    block
  )(preparedWebhook)
  if (!parsedWebhook) {
    logs.push({
      status: 'error',
      description: `Couldn't parse webhook attributes`,
    })
    return { outgoingEdgeId: block.outgoingEdgeId, logs }
  }
  if (block.options.isExecutedOnClient && !state.whatsApp)
    return {
      outgoingEdgeId: block.outgoingEdgeId,
      clientSideActions: [
        {
          webhookToExecute: parsedWebhook,
          expectsDedicatedReply: true,
        },
      ],
    }
  const { response: webhookResponse, logs: executeWebhookLogs } =
    await executeWebhook(parsedWebhook)
  return resumeWebhookExecution({
    state,
    block,
    logs: executeWebhookLogs,
    response: webhookResponse,
  })
}

const prepareWebhookAttributes = (
  webhook: Webhook,
  options: WebhookOptions
): Webhook => {
  if (options.isAdvancedConfig === false) {
    return { ...webhook, body: '{{state}}', ...defaultWebhookAttributes }
  } else if (options.isCustomBody === false) {
    return { ...webhook, body: '{{state}}' }
  }
  return webhook
}

const checkIfBodyIsAVariable = (body: string) => /^{{.+}}$/.test(body)

const parseWebhookAttributes =
   (state: SessionState, answers: AnswerInSessionState[] , block: WebhookBlock | ZapierBlock | MakeComBlock | PabblyConnectBlock | FlowwiseBlock) =>
  async (webhook: Webhook): Promise<ParsedWebhook | undefined> => {
    if (!webhook.url || !webhook.method) return
    const { typebot } = state.typebotsQueue[0]
    const basicAuth: { username?: string; password?: string } = {}
    const basicAuthHeaderIdx = webhook.headers.findIndex(
      (h) =>
        h.key?.toLowerCase() === 'authorization' &&
        h.value?.toLowerCase()?.includes('basic')
    )
    const isUsernamePasswordBasicAuth =
      basicAuthHeaderIdx !== -1 &&
      webhook.headers[basicAuthHeaderIdx].value?.includes(':')
    if (isUsernamePasswordBasicAuth) {
      const [username, password] =
        webhook.headers[basicAuthHeaderIdx].value?.slice(6).split(':') ?? []
      basicAuth.username = username
      basicAuth.password = password
      webhook.headers.splice(basicAuthHeaderIdx, 1)
    }
    const headers = convertKeyValueTableToObject(
      webhook.headers,
      typebot.variables
    ) as ExecutableWebhook['headers'] | undefined
    const queryParams = stringify(
      convertKeyValueTableToObject(webhook.queryParams, typebot.variables)
    )
    const bodyContent = await getBodyContent({
      body:  block.type == "Flow Wise" ?  JSON.stringify({ question : state.typebotsQueue[0].answers[0].value  }): webhook.body,
      answers,
      variables: typebot.variables,
    });
    console.log("body content", JSON.stringify(bodyContent) )
    const { data: body, isJson } =
      bodyContent && webhook.method !== HttpMethod.GET
        ? safeJsonParse(
            parseVariables(typebot.variables, {
              isInsideJson: !checkIfBodyIsAVariable(bodyContent),
            })(bodyContent)
          )
        : { data: undefined, isJson: false }
    console.log("bodyyyyy",body);
    return {
      url: parseVariables(typebot.variables)(
        webhook.url + (queryParams !== '' ? `?${queryParams}` : '')
      ),
      basicAuth,
      method: webhook.method,
      headers,
      body,
      isJson,
    }
  }

export const executeWebhook = async (
  webhook: ParsedWebhook
): Promise<{ response: WebhookResponse; logs?: ReplyLog[] }> => {
  const logs: ReplyLog[] = []
  const { headers, url, method, basicAuth, body, isJson } = webhook
  const contentType = headers ? headers['Content-Type'] : undefined
  console.log("webhook object",JSON.stringify(webhook))
  console.log("bodyyy inside execute webhook",body);
  console.log("final body passed", body && !isJson ? (body as string) : undefined );
  console.log("webhook url includes prediction",webhook.url.includes("prediction"));
  const request = {
    url,
    method: method as Method,
    headers,
    ...(basicAuth ?? {}),
    json:
      !contentType?.includes('x-www-form-urlencoded') && body && isJson
        ? body
        : undefined,
    form:
      contentType?.includes('x-www-form-urlencoded') && body ? body : undefined,
    body: !webhook.url.includes("prediction") ? body && !isJson ? (body as string) : undefined : (body as string)
  } satisfies OptionsInit
  try {
    // console.log("requst body finallllll", request.body,  omit(request, 'url') );
    // const resp1 = await got.post(request.url, {
    //   json : request.body ,
    //   responseType : "json"
    // } )
    // console.log("resp1 status",resp1.statusCode);
    // console.log("resp1 body", resp1.body ); 
    
    if ( webhook.url.includes("prediction") ) {
        
        const resp1 = await got.post(request.url, {
            json : request.body ,
            responseType : "json"
          } );
          logs.push({
            status: 'success',
            description: `Webhook successfuly executed.`,
            details: {
              statusCode: resp1.statusCode,
              request,
              response: resp1.body,
            },
          })
          return {
            response: {
              statusCode: resp1.statusCode,
              data: resp1.body,
            },
            logs,
          }
    } else {
      const response = await got(request.url, omit(request, 'url'))
      logs.push({
        status: 'success',
        description: `Webhook successfuly executed.`,
        details: {
          statusCode: response.statusCode,
          request,
          response: safeJsonParse(response.body).data,
        },
      })
      return {
        response: {
          statusCode: response.statusCode,
          data: safeJsonParse(response.body).data,
        },
        logs,
      }
    }
    
  } catch (error) {
    
    if (error instanceof HTTPError) {
      const response = {
        statusCode: error.response.statusCode,
        data: safeJsonParse(error.response.body as string).data,
      }
      logs.push({
        status: 'error',
        description: `Webhook returned an error.`,
        details: {
          statusCode: error.response.statusCode,
          request,
          response,
        },
      })
      return { response, logs }
    }
    const response = {
      statusCode: 500,
      data: { message: `Error from Typebot server: ${error}` },
    }
    console.error(error)
    logs.push({
      status: 'error',
      description: `Webhook failed to execute.`,
      details: {
        request,
        response,
      },
    })
    return { response, logs }
  }
}

const getBodyContent = async ({
  body,
  answers,
  variables,
}: {
  body?: string | null
  answers: AnswerInSessionState[]
  variables: Variable[]
}): Promise<string | undefined> => {
  if (!body) return
  return body === '{{state}}'
    ? JSON.stringify(
        parseAnswers({
          answers,
          variables: getDefinedVariables(variables),
        })
      )
    : body
}

const convertKeyValueTableToObject = (
  keyValues: KeyValue[] | undefined,
  variables: Variable[]
) => {
  if (!keyValues) return
  return keyValues.reduce((object, item) => {
    if (!item.key) return {}
    return {
      ...object,
      [item.key]: parseVariables(variables)(item.value ?? ''),
    }
  }, {})
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeJsonParse = (json: string): { data: any; isJson: boolean } => {
  try {
    return { data: JSON.parse(json), isJson: true }
  } catch (err) {
    return { data: json, isJson: false }
  }
}
