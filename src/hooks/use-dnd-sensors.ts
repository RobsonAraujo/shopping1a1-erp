"use client";

import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

/**
 * Sensores padrão de drag-and-drop do app — um único `PointerSensor` cobre
 * mouse e touch, com uma pequena distância de ativação pra não disparar
 * drag num toque/clique normal. Reaproveitar em qualquer novo `DndContext`
 * do site em vez de reconfigurar sensores a cada feature.
 */
export function useDndSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
}
