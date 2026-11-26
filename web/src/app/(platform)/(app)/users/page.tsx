import { Suspense } from "react";
import { UserAccess } from "@/components/users/user-access";
import { UsersList, UsersListSkeleton } from "@/components/users/users-list";

export default function UsersPage() {
  // UsersList reads the URL (`useSearchParams`), which must sit inside a Suspense boundary.
  return (
    <UserAccess>
      <Suspense fallback={<UsersListSkeleton />}>
        <UsersList />
      </Suspense>
    </UserAccess>
  );
}
