import { useEffect, useMemo, useState } from "react";
import { Mail, Shield, UserPlus2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
  MODULES,
  ROLE_LABELS,
  TeamMember,
  TeamRole,
  defaultModulesForRole,
  useTeamStore,
} from "@/hooks/useTeamStore";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: TeamMember | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddMemberDialog({ open, onOpenChange, editing }: Props) {
  const { addMember, updateMember } = useTeamStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("manager");
  const [modules, setModules] = useState<string[]>(defaultModulesForRole("manager"));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name); setEmail(editing.email);
        setRole(editing.role); setModules(editing.modules);
      } else {
        setName(""); setEmail("");
        setRole("manager");
        setModules(defaultModulesForRole("manager"));
      }
    }
  }, [open, editing]);

  const handleRoleChange = (r: TeamRole) => {
    setRole(r);
    setModules(defaultModulesForRole(r));
  };

  const toggleModule = (key: string) => {
    setModules((m) => (m.includes(key) ? m.filter((k) => k !== key) : [...m, key]));
  };

  const allChecked = modules.length === MODULES.length;
  const counter = useMemo(() => `${modules.length}/${MODULES.length} модулей`, [modules]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length < 2) {
      toast({ title: "Укажите имя сотрудника", description: "Минимум 2 символа", variant: "destructive" });
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      toast({ title: "Некорректный email", variant: "destructive" });
      return;
    }
    if (role === "manager" && modules.length === 0) {
      toast({ title: "Выберите хотя бы один модуль", variant: "destructive" });
      return;
    }
    const payload = {
      name: trimmedName,
      email: trimmedEmail,
      role,
      modules: modules as TeamMember["modules"],
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateMember(editing.id, payload);
        toast({ title: "Сотрудник обновлён" });
      } else {
        await addMember(payload);
        toast({
          title: "Приглашение отправлено",
          description: `На ${trimmedEmail} ушло письмо со ссылкой для создания пароля.`,
        });
      }
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Не удалось сохранить",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Редактировать сотрудника" : "Добавить сотрудника"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Измените роль и набор модулей"
              : "Введите имя и email — сотруднику придёт письмо со ссылкой для входа и создания пароля"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-success/15 text-success">
                <UserPlus2 className="h-3.5 w-3.5" />
              </span>
              Учётные данные
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-name">Имя</Label>
                <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Иванов" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-email">Email</Label>
                <Input
                  id="m-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ivan@example.com"
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Роль</Label>
                <Select value={role} onValueChange={(v) => handleRoleChange(v as TeamRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Админ — полный доступ ко всем модулям и настройкам. Менеджер видит только выбранные ниже модули.
                </p>
              </div>
            </div>

            {!editing && (
              <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-xs text-muted-foreground">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>
                  После добавления сотрудник получит письмо на <b>{email || "указанный email"}</b> со
                  ссылкой для входа. Пароль он создаст сам при первом открытии ссылки.
                </span>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-success/15 text-success">
                  <Shield className="h-3.5 w-3.5" />
                </span>
                Права доступа
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{counter}</span>
                <button
                  type="button"
                  onClick={() => setModules(allChecked ? [] : MODULES.map((m) => m.key))}
                  className="text-xs text-success hover:underline"
                  disabled={role === "admin"}
                >
                  {allChecked ? "Снять все" : "Выбрать все"}
                </button>
              </div>
            </div>
            <div className={`grid gap-2 sm:grid-cols-2 ${role === "admin" ? "opacity-60" : ""}`}>
              {MODULES.map((m) => {
                const checked = role === "admin" ? true : modules.includes(m.key);
                return (
                  <label
                    key={m.key}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      checked ? "border-success/50 bg-success/5" : "border-border/60 hover:bg-secondary/40"
                    } ${role === "admin" ? "pointer-events-none" : ""}`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleModule(m.key)} />
                    <span className="text-sm">{m.label}</span>
                  </label>
                );
              })}
            </div>
            {role === "admin" && (
              <p className="text-[11px] text-muted-foreground">
                У администратора доступ ко всем модулям включён автоматически.
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Сохраняем…" : editing ? "Сохранить" : "Отправить приглашение"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
