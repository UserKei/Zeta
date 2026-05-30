import { serverApi } from '..'

export const getFileBlob = async (fileId: string) => {
  const response = await serverApi.get<Blob>(`/files/${fileId}`, {
    responseType: 'blob',
  })

  return response.data
}
