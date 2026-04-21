import { PointerSensor } from '@dnd-kit/core';

/**
 * GripVertical 핸들([data-dnd-handle])에서 시작된 포인터만 허용하는 커스텀 센서.
 *
 * 일반 PointerSensor는 DndContext 내부 어디서든 드래그를 시작하여
 * native HTML draggable과 충돌한다. 이 센서는 핸들 요소에서만 활성화되므로
 * 아이템 행의 native drag가 자유롭게 동작한다.
 */
export class HandleOnlyPointerSensor extends PointerSensor {
  static override activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        { nativeEvent: event }: { nativeEvent: PointerEvent },
        { onActivation }: { onActivation?: (args: { event: PointerEvent }) => void },
      ) => {
        if (!event.isPrimary || event.button !== 0) return false;

        const target = event.target as HTMLElement;
        if (!target.closest('[data-dnd-handle]')) return false;

        onActivation?.({ event });
        return true;
      },
    },
  ];
}
