declare module 'deep-equal-in-any-order';

declare namespace Chai {
    interface Deep {
        equalInAnyOrder: Equal;
    }
}
