import { connect } from '@planetscale/database'
import { PrismaClient } from '@typebot.io/prisma'
import { env } from '@typebot.io/env'
import { IntegrationBlockType, SessionState } from '@typebot.io/schemas'
import { StreamingTextResponse } from 'ai'
import { getChatCompletionStream } from '@typebot.io/bot-engine/blocks/integrations/openai/getChatCompletionStream'
import OpenAI from 'openai'
import { NextResponse } from 'next/dist/server/web/spec-extension/response'

// export const runtime = 'edge'
export const preferredRegion = 'lhr1'
export const dynamic = 'force-dynamic'

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
}

export async function OPTIONS() {
  return new Response('ok', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
      'Access-Control-Allow-Headers': '*',
    },
  })
}

export async function POST(req: Request) {
  const { sessionId, messages } = (await req.json()) as {
    sessionId: string
    messages: OpenAI.Chat.ChatCompletionMessage[]
  }

  if (!sessionId)
    return NextResponse.json(
      { message: 'No session ID provided' },
      { status: 400, headers: responseHeaders }
    )

  if (!messages)
    return NextResponse.json(
      { message: 'No messages provided' },
      { status: 400, headers: responseHeaders }
    )
     console.log("establish prisma connection");
    const prisma = new PrismaClient();
  // const conn = connect({ url: env.DATABASE_URL })

  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { state: true },
  });
  console.log("chat session",chatSession);
  // const chatSession = await conn.execute(
  //   'select state from ChatSession where id=?',
  //   [sessionId]
  // )
 // @ts-ignore
  // const state = (chatSession.rows.at(0) as { state: SessionState } | undefined)
  //   ?.state
   const state = (chatSession as { state: SessionState } | undefined)
     ?.state
  if (!state)
    return NextResponse.json(
      { message: 'No state found' },
      { status: 400, headers: responseHeaders }
    )

  const group = state.typebotsQueue[0].typebot.groups.find(
    (group) => group.id === state.currentBlock?.groupId
  )
  const blockIndex =
    group?.blocks.findIndex(
      (block) => block.id === state.currentBlock?.blockId
    ) ?? -1

  const block = blockIndex >= 0 ? group?.blocks[blockIndex ?? 0] : null

  if (!block || !group)
    return NextResponse.json(
      { message: 'Current block not found' },
      { status: 400, headers: responseHeaders }
    )

  if (
    block.type !== IntegrationBlockType.OPEN_AI ||
    block.options.task !== 'Create chat completion'
  )
    return NextResponse.json(
      { message: 'Current block is not an OpenAI block' },
      { status: 400, headers: responseHeaders }
    )

  try {
    // const stream = await getChatCompletionStream(conn)(
    //   state,
    //   block.options,
    //   messages
    // )
    const stream = await getChatCompletionStream(prisma)(
      state,
      block.options,
      messages
    )
    if (!stream)
      return NextResponse.json(
        { message: 'Could not create stream' },
        { status: 400, headers: responseHeaders }
      )
      // // @ts-ignore
      // stream.on('data', (data) => {
      //   // Handle the incoming data from the stream
      //   console.log('Received data:', data);
      // });
      // // @ts-ignore
      // stream.on('end', () => {
      //   // The stream has ended
      //   console.log('Stream ended');
      // });
      // // @ts-ignore
      // stream.on('error', (error) => {
      //   // Handle any errors that occur during streaming
      //   console.error('Error:', error);
      // });
    return new StreamingTextResponse(stream, {
      headers: responseHeaders,
    })
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      const { name, status, message } = error
      return NextResponse.json(
        { name, status, message },
        { status, headers: responseHeaders }
      )
    } else {
      throw error
    }
  }
}


// import { connect } from '@planetscale/database';
// import { env } from '@typebot.io/env';
// import { SessionState } from '@typebot.io/schemas';
// import OpenAI from 'openai';

// export const preferredRegion = 'lhr1';

// const responseHeaders = {
//   'Access-Control-Allow-Origin': '*',
//   'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
//   Pragma: 'no-cache',
// };

// export async function OPTIONS() {
//   return new Response('ok', {
//     headers: {
//       'Access-Control-Allow-Origin': '*',
//       'Access-Control-Allow-Methods': 'POST',
//       'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
//       'Access-Control-Allow-Headers': '*',
//     },
//   });
// }

// export async function POST(req: Request) {
//   const { sessionId, messages } = (await req.json()) as {
//     sessionId: string;
//     messages: OpenAI.Chat.ChatCompletionMessage[];
//   };

//   if (!sessionId) {
//     return new Response(JSON.stringify({ message: 'No session ID provided' }), {
//       status: 400,
//       headers: responseHeaders,
//     });
//   }

//   if (!messages) {
//     return new Response(JSON.stringify({ message: 'No messages provided' }), {
//       status: 400,
//       headers: responseHeaders,
//     });
//   }

//   const conn = connect({ url: env.DATABASE_URL });

//   const chatSession = await conn.execute('select state from ChatSession where id=?', [sessionId]);

//   const state = (chatSession.rows.at(0) as { state: SessionState } | undefined)?.state;

//   if (!state) {
//     return new Response(JSON.stringify({ message: 'No state found' }), {
//       status: 400,
//       headers: responseHeaders,
//     });
//   }

//   const group = state.typebotsQueue[0].typebot.groups.find(
//     (group) => group.id === state.currentBlock?.groupId
//   );
//   const blockIndex =
//     group?.blocks.findIndex(
//       (block) => block.id === state.currentBlock?.blockId
//     ) ?? -1;

//   const block = blockIndex >= 0 ? group?.blocks[blockIndex ?? 0] : null;

//   if (!block || !group) {
//     return new Response(JSON.stringify({ message: 'Current block not found' }), {
//       status: 400,
//       headers: responseHeaders,
//     });
//   }

//   if (
//     block.type !== IntegrationBlockType.OPEN_AI ||
//     block.options.task !== 'Create chat completion'
//   ) {
//     return new Response(JSON.stringify({ message: 'Current block is not an OpenAI block' }), {
//       status: 400,
//       headers: responseHeaders,
//     });
//   }

//   try {
//     // Initialize the OpenAI client with your API key
//     const apiKey = 'YOUR_OPENAI_API_KEY'; // Replace with your OpenAI API key
//     const openai = new OpenAI({ apiKey });

//     const response = await openai.chat.completions.create({
//       model: block.options.model, // Replace with your desired OpenAI model
//       messages,
//       stream: true,
//     });

//     return new Response(response.stream, {
//       headers: {
//         ...responseHeaders,
//         'Content-Type': 'text/plain',
//       },
//     });
//   } catch (error) {
//     return new Response(error.toString(), {
//       status: 500,
//       headers: responseHeaders,
//     });
//   }
// }
