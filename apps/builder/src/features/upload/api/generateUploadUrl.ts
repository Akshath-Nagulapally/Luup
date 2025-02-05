import { authenticatedProcedure } from '@/helpers/server/trpc'
import { z } from 'zod'
import { env } from '@typebot.io/env'
import { TRPCError } from '@trpc/server'
import { generatePresignedPostPolicy } from '@typebot.io/lib/s3/generatePresignedPostPolicy'
import { generatePresignedPostPolicyBlob } from '@typebot.io/lib/azure-blob/generatePresignedPostPolicy'
import prisma from '@typebot.io/lib/prisma'
import { isWriteWorkspaceForbidden } from '@/features/workspace/helpers/isWriteWorkspaceForbidden'
import { isWriteTypebotForbidden } from '@/features/typebot/helpers/isWriteTypebotForbidden'

const inputSchema = z.object({
  filePathProps: z
    .object({
      workspaceId: z.string(),
      typebotId: z.string(),
      blockId: z.string(),
      itemId: z.string().optional(),
    })
    .or(
      z.object({
        workspaceId: z.string(),
        typebotId: z.string(),
        fileName: z.string(),
      })
    )
    .or(
      z.object({
        userId: z.string(),
        fileName: z.string(),
      })
    )
    .or(
      z.object({
        workspaceId: z.string(),
        fileName: z.string(),
      })
    ),
  fileType: z.string().optional(),
})

export type FilePathUploadProps = z.infer<
  typeof inputSchema.shape.filePathProps
>

export const generateUploadUrl = authenticatedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/generate-upload-url',
      summary: 'Generate upload URL',
      description: 'Generate the needed URL to upload a file from the client',
    },
  })
  .input(inputSchema)
  .output(
    z.object({
      presignedUrl: z.string(),
      formData: z.record(z.string(), z.any()),
      fileUrl: z.string(),
    })
  )
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  .mutation(async ({ input: { filePathProps, fileType }, ctx: { user } }) => {
    if (
      (!env.S3_ENDPOINT && !env.S3_ACCESS_KEY && !env.S3_SECRET_KEY) ||
      (!env.AZURE_BLOB_CONNECTION_STRING && !env.AZURE_BLOB_CONTAINER_NAME)
    )
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'File upload not configured properly',
      })

    if ('resultId' in filePathProps && !user)
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to upload a file',
      })

    const filePath = await parseFilePath({
      authenticatedUserId: user?.id,
      uploadProps: filePathProps,
    })
    if (env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY) {
      const presignedPostPolicy = await generatePresignedPostPolicy({
        fileType,
        filePath,
      })

      return {
        presignedUrl: presignedPostPolicy.postURL,
        formData: presignedPostPolicy.formData,
        fileUrl: env.S3_PUBLIC_CUSTOM_DOMAIN
          ? `${env.S3_PUBLIC_CUSTOM_DOMAIN}/${filePath}`
          : `${presignedPostPolicy.postURL}/${presignedPostPolicy.formData.key}`,
      }
    } else if (
      env.AZURE_BLOB_CONNECTION_STRING &&
      env.AZURE_BLOB_CONTAINER_NAME
    ) {
      const presignedPostPolicy = await generatePresignedPostPolicyBlob({
        fileType,
        filePath,
      })

      return {
        presignedUrl: presignedPostPolicy.presignedUrl,
        formData: presignedPostPolicy.formData,
        fileUrl: env.AZURE_BLOB_PUBLIC_CUSTOM_DOMAIN
          ? `${env.AZURE_BLOB_PUBLIC_CUSTOM_DOMAIN}/${filePath}`
          : `${presignedPostPolicy.presignedUrl}/${presignedPostPolicy.formData.key}`,
      }
    }
  })

type Props = {
  authenticatedUserId?: string
  uploadProps: FilePathUploadProps
}

const parseFilePath = async ({
  authenticatedUserId,
  uploadProps: input,
}: Props): Promise<string> => {
  if (!authenticatedUserId)
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to upload this type of file',
    })
  if ('userId' in input) {
    if (input.userId !== authenticatedUserId)
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You are not authorized to upload a file for this user',
      })
    return `public/users/${input.userId}/${input.fileName}`
  }
  if (!('workspaceId' in input))
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'workspaceId is missing',
    })
  if (!('typebotId' in input)) {
    const workspace = await prisma.workspace.findUnique({
      where: {
        id: input.workspaceId,
      },
      select: {
        members: {
          select: {
            userId: true,
            role: true,
          },
        },
      },
    })
    if (
      !workspace ||
      isWriteWorkspaceForbidden(workspace, { id: authenticatedUserId })
    )
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      })
    return `public/workspaces/${input.workspaceId}/${input.fileName}`
  }
  const typebot = await prisma.typebot.findUnique({
    where: {
      id: input.typebotId,
    },
    select: {
      workspaceId: true,
      collaborators: {
        select: {
          userId: true,
          type: true,
        },
      },
    },
  })
  if (
    !typebot ||
    (await isWriteTypebotForbidden(typebot, {
      id: authenticatedUserId,
    }))
  )
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Typebot not found',
    })
  if (!('blockId' in input)) {
    return `public/workspaces/${input.workspaceId}/typebots/${input.typebotId}/${input.fileName}`
  }
  return `public/workspaces/${input.workspaceId}/typebots/${
    input.typebotId
  }/blocks/${input.blockId}${input.itemId ? `/items/${input.itemId}` : ''}`
}
