import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Redirects to Settings → WhatsApp (Meta Coexistence). No fake "connected" state. */
export function ConnectWhatsAppDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  const go = () => {
    onOpenChange(false);
    navigate("/settings?tab=whatsapp");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-success/15 text-success">
              <MessageCircle className="h-4 w-4" />
            </span>
            Подключить WhatsApp Business
          </DialogTitle>
          <DialogDescription>
            Подключение через официальный Meta: QR в приложении WhatsApp Business,
            привязка к проекту и кабинету. Все новые входящие попадут в CRM на этап «Новая».
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
          Откроется раздел Настройки → WhatsApp. Выберите проект и кабинет, затем
          нажмите «Подключить WhatsApp Business».
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={go} className="bg-gradient-primary text-primary-foreground">
            Перейти к подключению
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
