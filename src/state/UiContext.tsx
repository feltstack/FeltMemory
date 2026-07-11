/** UI-only state: toasts + which bottom sheet is open. */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Viewport rect of the element that opened the sheet — lets desktop render
 *  the player card as a popover next to that row instead of a bottom sheet. */
export interface SheetAnchor {
  top: number;
  bottom: number;
  left: number;
}

export type SheetState =
  | { kind: 'player'; playerId: number; seatNo?: number; anchor?: SheetAnchor }
  | { kind: 'assign'; seatNo: number }
  | { kind: 'menu' }
  | null;

interface UiCtx {
  toast: (msg: string) => void;
  toastMsg: string;
  toastShow: boolean;
  sheet: SheetState;
  openPlayer: (playerId: number, seatNo?: number, anchor?: SheetAnchor) => void;
  openAssign: (seatNo: number) => void;
  openMenu: () => void;
  closeSheet: () => void;
}

const Ctx = createContext<UiCtx | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastShow(false), 1800);
  }, []);

  const openPlayer = useCallback(
    (playerId: number, seatNo?: number, anchor?: SheetAnchor) =>
      setSheet({ kind: 'player', playerId, seatNo, anchor }),
    [],
  );
  const openAssign = useCallback(
    (seatNo: number) => setSheet({ kind: 'assign', seatNo }),
    [],
  );
  const openMenu = useCallback(() => setSheet({ kind: 'menu' }), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  return (
    <Ctx.Provider
      value={{ toast, toastMsg, toastShow, sheet, openPlayer, openAssign, openMenu, closeSheet }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useUi(): UiCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUi outside UiProvider');
  return ctx;
}
