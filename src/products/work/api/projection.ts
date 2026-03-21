import type { CatsCoreState } from '../../../core/types.js';

export interface WorkPlaceholderProjection {
  product: {
    id: 'work';
    name: 'Cats Work';
    status: 'placeholder';
    routeBase: '/work';
    apiBase: '/api/work';
  };
  summary: {
    ownerActorId: string;
    actorCount: number;
    conversationCount: number;
    taskCount: number;
  };
  extensionPoints: {
    projectionSource: 'cats-core';
    futureRoutes: string[];
  };
}

export function buildWorkPlaceholderProjection(core: CatsCoreState): WorkPlaceholderProjection {
  return {
    product: {
      id: 'work',
      name: 'Cats Work',
      status: 'placeholder',
      routeBase: '/work',
      apiBase: '/api/work',
    },
    summary: {
      ownerActorId: core.ownerProfile.actorId,
      actorCount: core.actors.length,
      conversationCount: core.conversations.length,
      taskCount: core.tasks.length,
    },
    extensionPoints: {
      projectionSource: 'cats-core',
      futureRoutes: [
        '/api/work/teams',
        '/api/work/war-room',
        '/api/work/delivery-policy',
      ],
    },
  };
}
