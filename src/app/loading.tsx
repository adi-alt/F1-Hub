import { PersonalHomeOutline } from "@/components/home/personal/PersonalSections";

// The home page's loading state. Every other route has its own loading.tsx, so this is effectively the home's
// (audit CR-26): the hero first, as both the signed-in home and the landing page open with it, then the
// signed-in sections in their real places, on the same frame and padding as the page (HomeLayout's
// page-content, py-10), so nothing jumps when the page arrives.
export default function Loading() {
  return (
    <div className="page-content py-10">
      <PersonalHomeOutline />
    </div>
  );
}
