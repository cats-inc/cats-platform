import type { CatsCoreState } from '../../../core/types.js';

export interface CodePlaceholderProjection {
  product: {
    id: 'code';
    name: 'Cats Code';
    status: 'placeholder';
    routeBase: '/code';
    apiBase: '/api/code';
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

export function buildCodePlaceholderProjection(core: CatsCoreState): CodePlaceholderProjection {
  return {
    product: {
      id: 'code',
      name: 'Cats Code',
      status: 'placeholder',
      routeBase: '/code',
      apiBase: '/api/code',
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
        '/api/code/projects',
        '/api/code/previews',
        '/api/code/builds',
      ],
    },
  };
}
