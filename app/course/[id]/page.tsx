import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageParts';
import CourseDetail from '@/components/CourseDetail';
import { COURSE_IDS } from '@/lib/format';
import type { CourseId } from '@/lib/types';

// One page per course (/course/data-analyst ...), all four built ahead of time for the static export.
export const dynamicParams = false;

export function generateStaticParams() {
  return COURSE_IDS.map((id) => ({ id }));
}

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CourseDetail courseId={id as CourseId} />
    </Suspense>
  );
}
