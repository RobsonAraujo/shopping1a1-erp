import { redirect } from "next/navigation";

/** Legacy: kanban de compra foi para /dashboard/compras?tab=kanban */
export default function OperacoesPage() {
  redirect("/dashboard/compras?tab=kanban");
}
