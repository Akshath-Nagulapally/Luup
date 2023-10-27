import { BlobServiceClient } from '@azure/storage-blob'
// @ts-ignore
export const deleteFilesFromBlob = async ({ urls }) => {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    'DefaultEndpointsProtocol=https;AccountName=quadz;AccountKey=RuFUoYZqDSehJuoMoWG3OpiZ0mXHErhHv7de/n2bEJgRwacCD3hPDuTxWAKeAYYCOU3eBXA6BY7a+ASt+FiSJA==;EndpointSuffix=core.windows.net'
  )
  const containerClient = blobServiceClient.getContainerClient('demo')
  for (const url of urls) {
    const blobClient = containerClient.getBlobClient(url)
    await blobClient.delete()
  }
}
