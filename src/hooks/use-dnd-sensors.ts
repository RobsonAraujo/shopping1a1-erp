"use client";

import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

/**
 * Sensores padrão de drag-and-drop do app. `MouseSensor` cuida do desktop
 * (ativa ao mover 5px, igual antes). `TouchSensor` cuida do toque com um
 * delay de "pressionar e segurar" antes de ativar o drag — sem isso, um
 * toque comum pra rolar a tela na horizontal/vertical (scroll) já disparava
 * o drag do card com qualquer movimento pequeno do dedo. Com o delay, um
 * scroll normal (movimento imediato) cancela a ativação; só um toque
 * mantido active o drag. `KeyboardSensor` dá acesso via teclado (Tab até o
 * card, Espaço/Enter pra pegar, setas pra mover, Espaço/Enter pra soltar,
 * Esc pra cancelar) — funciona porque os cards espalham `attributes`/
 * `listeners` do `useDraggable` no elemento raiz (tabIndex + keydown já vêm
 * de lá). Reaproveitar em qualquer novo `DndContext` do site em vez de
 * reconfigurar sensores a cada feature.
 */
export function useDndSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
}
