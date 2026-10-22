"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { barBtn } from "@/components/ui/Popover";
import { useI18n } from "@/components/i18n/I18nProvider";

/** Signed out: a quiet "Sign in". Signed in: the avatar, with Clerk's account menu. */
export function Account() {
  const { t } = useI18n();
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className={`${barBtn} !px-3 whitespace-nowrap`} data-tip={t("account.keepEverywhere")}>
            {t("common.signIn")}
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <span className="grid size-9 place-items-center">
          <UserButton appearance={{ elements: { avatarBox: "size-7" } }} />
        </span>
      </Show>
    </>
  );
}
