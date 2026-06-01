import { toast } from 'vue-sonner'

export const getErrorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback

export const showErrorMessage = (cause: unknown, fallback: string) => {
  toast.error(getErrorMessage(cause, fallback))
}

export const showSuccessMessage = (message: string) => {
  toast.success(message)
}

export const isCancelAction = (cause: unknown) => cause === 'cancel' || cause === 'close'
