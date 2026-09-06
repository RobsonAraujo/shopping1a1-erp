import { redirect } from "next/navigation";

/** Legacy: kanban de compra foi para /dashboard/compras */
export default function OperacoesPage() {
  redirect("/dashboard/compras");
}
