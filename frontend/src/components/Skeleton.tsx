"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200 ${className}`}
      aria-hidden="true"
    />
  );
}

export function DocumentListSkeleton() {
  return (
    <div className="card">
      <Skeleton className="mb-3 h-4 w-24" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg p-3">
            <Skeleton className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="card flex h-[600px] flex-col">
      <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center">
        <Skeleton className="mb-3 h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-2 h-3 w-36" />
      </div>
      <div className="mt-4 flex gap-3 border-t border-gray-100 pt-4">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  );
}
