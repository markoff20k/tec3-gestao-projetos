import { useToast } from "@/hooks/use-toast"
import { usePreferences } from "@/contexts/PreferencesContext"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToastIcon,
} from "@/components/ui/toast"

function viewportClassForPosition(position: string): string {
  switch (position) {
    case 'top-left':
      return 'top-0 left-0 right-auto bottom-auto sm:top-0 sm:left-0 sm:right-auto sm:bottom-auto sm:flex-col-reverse';
    case 'top-right':
      return 'top-0 right-0 left-auto bottom-auto sm:top-0 sm:right-0 sm:left-auto sm:bottom-auto sm:flex-col-reverse';
    case 'bottom-left':
      return 'bottom-0 left-0 top-auto right-auto sm:bottom-0 sm:left-0 sm:top-auto sm:right-auto';
    case 'bottom-right':
    default:
      return 'bottom-0 right-0 top-auto left-auto sm:bottom-0 sm:right-0 sm:top-auto sm:left-auto';
  }
}

function toastVerticalPosition(position: string): 'top' | 'bottom' {
  return position.startsWith('top') ? 'top' : 'bottom';
}

export function Toaster() {
  const { toasts } = useToast()
  const { toastPosition } = usePreferences()
  const vertical = toastVerticalPosition(toastPosition)

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} data-position={vertical} {...props}>
            <div className="flex items-start gap-3">
              <ToastIcon variant={variant as "default" | "destructive" | "success" | "info"} />
              <div className="grid gap-0.5">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport className={viewportClassForPosition(toastPosition)} />
    </ToastProvider>
  )
}
