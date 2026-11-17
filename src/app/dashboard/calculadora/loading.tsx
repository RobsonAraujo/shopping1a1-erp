import { CalculatorPageHeader } from "@/components/calculadora/CalculatorPageHeader";
import { CalculatorSkeleton } from "@/components/calculadora/CalculatorSkeleton";

export default function CalculadoraLoading() {
  return (
    <div className="space-y-5">
      <CalculatorPageHeader />
      <CalculatorSkeleton />
    </div>
  );
}
