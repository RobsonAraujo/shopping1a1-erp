"use client";

import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

/**
 * Sensores padrão de drag-and-drop do app — `PointerSensor` cobre mouse e
 * touch (pequena distância de ativação pra não disparar drag num toque/
 * clique normal) e `KeyboardSensor` dá acesso via teclado (Tab até o card,
 * Espaço/Enter pra pegar, setas pra mover, Espaço/Enter pra soltar, Esc pra
 * cancelar) — funciona porque os cards espalham `attributes`/`listeners` do
 * `useDraggable` no elemento raiz (tabIndex + keydown já vêm de lá). Sem
 * isso o board só era operável por mouse/touch. Reaproveitar em qualquer
 * novo `DndContext` do site em vez de reconfigurar sensores a cada feature.
 */
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
}
