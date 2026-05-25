import { ElMessage } from 'element-plus'

export const getErrorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback

export const showErrorMessage = (cause: unknown, fallback: string) => {
  ElMessage.error(getErrorMessage(cause, fallback))
}

export const isCancelAction = (cause: unknown) =>
  cause === 'cancel' || cause === 'close'
