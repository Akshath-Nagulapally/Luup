const {
  BlobServiceClient,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob')
import { env } from '@typebot.io/env'
type Props = {
  filePath: string
  fileType?: string
  maxFileSize?: number
}

const tenMinutes = 10 * 60

export const generatePresignedPostPolicyBlob = async ({
  filePath,
  fileType,
  maxFileSize,
}: Props): Promise<{
  presignedUrl: string
  formData: Record<string, string>
  fileUrl: string
}> => {
  if (!env.AZURE_BLOB_CONNECTION_STRING || !env.AZURE_BLOB_CONTAINER_NAME) {
    throw new Error('Azure Blob Storage not properly configured.')
  }

  // Create a BlobServiceClient using the connection string
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    env.AZURE_BLOB_CONNECTION_STRING
  )

  // Create a container client and blob client
  const containerName = env.AZURE_BLOB_CONTAINER_NAME // Replace with your container name
  const blobName = filePath
  const containerClient = blobServiceClient.getContainerClient(containerName)
  const blobClient = containerClient.getBlobClient(blobName)

  // Set the constraints for the SAS token
  const expiresOn = new Date(new Date().getTime() + tenMinutes * 1000)
  const permissions = 'cw' // "c" for create (upload) permission
  const options = {
    permissions,
    startsOn: new Date(),
    expiresOn,
  }

  if (maxFileSize) {
    // @ts-ignore
    options['contentDisposition'] = `inline; filename="${filePath}"`
    // @ts-ignore
    options['contentType'] = fileType || 'application/octet-stream'
    // @ts-ignore
    options['contentLength'] = maxFileSize * 1024 * 1024
  }

  // Generate a SAS token
  let sasToken = await blobClient.generateSasUrl(options)
  // console.log("sas token",sasToken);
  // sasToken = `https://quadz.blob.core.windows.net/demo1/${filePath}?sp=racwdli&st=2023-10-27T07:05:54Z&se=2023-11-11T15:05:54Z&sv=2022-11-02&sr=c&sig=1muEgcvMyFAv2Ru%2BYiztH%2ByKi5FxVq3wUDtvg0bVf1U%3D`;
  // console.log("modified sas token", sasToken );
  const fileUrl = env.AZURE_BLOB_PUBLIC_CUSTOM_DOMAIN
    ? `${env.AZURE_BLOB_PUBLIC_CUSTOM_DOMAIN}/${filePath}`
    : sasToken
  // return sasToken;
  return {
    presignedUrl: sasToken,
    formData: {
      key: filePath,
      'Content-Type': fileType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${filePath}"`,
    },
    fileUrl,
  }
}
