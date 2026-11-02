import {
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        variant,
        ...props
      }) {
        const Icon =
          variant === "destructive"
            ? ExclamationTriangleIcon
            : variant === "success"
              ? CheckIcon
              : InformationCircleIcon;
        return (
          <Toast key={id} variant={variant} {...props}>
            <span
              aria-hidden="true"
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[#f7826d]",
                variant === "destructive" && "bg-destructive/15 text-red-300",
                variant === "success" && "bg-success/15 text-green-300",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5 break-words">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
