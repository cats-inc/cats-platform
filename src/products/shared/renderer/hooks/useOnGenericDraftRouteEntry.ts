import {
  useEffect,
  useRef,
} from 'react';

export function useOnGenericDraftRouteEntry(
  isGenericDraftRoute: boolean,
  onEnterGenericDraftRoute: () => void,
): void {
  const wasGenericDraftRoute = useRef(false);

  useEffect(() => {
    const justEnteredGenericDraftRoute =
      isGenericDraftRoute && !wasGenericDraftRoute.current;
    wasGenericDraftRoute.current = isGenericDraftRoute;
    if (!justEnteredGenericDraftRoute) {
      return;
    }

    onEnterGenericDraftRoute();
  }, [isGenericDraftRoute, onEnterGenericDraftRoute]);
}
