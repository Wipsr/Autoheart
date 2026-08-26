#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read-only health check for the farm account.

Answers the three questions the failure logs keep raising -- is the account at
the friend cap, how many guest friend requests have piled up unanswered, and
what is actually sitting in the mailbox -- WITHOUT writing anything: no accepts,
no declines, no removals, no hearts sent, no mail collected. Safe to run any
time, including while deciding whether the fixes are worth shipping.

    python3 diagnose.py --email you@example.com
"""
import argparse
import getpass
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heart_farm as hf


def _report_friends(acct):
    friends, pending, err = hf._list_friends(acct)
    if friends is None:
        print("  ListFriends FAILED -> %s" % json.dumps(err, ensure_ascii=False)[:200])
        return None, None

    cap = hf.GAME_FRIEND_CAP
    guest_friends = [f for f in friends if hf._looks_like_guest(f)]
    print("\n--- FRIENDS ---")
    print("  %d / %d used   (%d slot(s) free)" % (len(friends), cap, max(0, cap - len(friends))))
    print("  %d look like leftover guests, %d look like real players"
          % (len(guest_friends), len(friends) - len(guest_friends)))
    if len(friends) >= cap:
        print("  >> AT THE CAP: every accept is refused until slots are freed.")
        print("     This alone explains 'accept FAILED (after mop-up)'.")
    elif cap - len(friends) < 20:
        print("  >> Nearly full -- a session sized off a stale count would run into the cap.")

    print("\n--- PENDING FRIEND REQUESTS ---")
    guest_reqs = [fr for fr in (pending or [])
                  if hf._looks_like_guest(fr.get("requester") or {})]
    print("  %d waiting for an answer, %d of them look like guests" % (len(pending or []), len(guest_reqs)))
    if guest_reqs:
        print("  >> These are the ones cleanup now declines. They were unreachable before:")
        print("     RemoveFriend does not touch a request that was never accepted.")
    for fr in (pending or [])[:5]:
        r = fr.get("requester") or {}
        print("     e.g. %s  level=%s  nickname=%r  -> %s"
              % (r.get("player_id"), r.get("level"), (r.get("profile") or {}).get("nickname"),
                 "would decline" if hf._looks_like_guest(r) else "LEFT ALONE (looks real)"))
    if len(pending or []) > 5:
        print("     ... and %d more" % (len(pending) - 5))
    return friends, pending


def _report_mailbox(acct):
    print("\n--- MAILBOX ---")
    ml = acct.ds_call("game/myMailList.ds")
    if ml.get("__error__"):
        print("  myMailList FAILED -> %s" % json.dumps(ml, ensure_ascii=False)[:200])
        return
    mail = (ml.get("data") or {}).get("mailList") or []
    with_sender = [m for m in mail if m.get("fromMemberSeq")]
    print("  %d entr%s" % (len(mail), "y" if len(mail) == 1 else "ies"))
    print("  %d from another player (heart gifts), %d from the system"
          % (len(with_sender), len(mail) - len(with_sender)))
    if not mail:
        return
    # The claim path only ever reads seq/fromMemberSeq. If the server also hands
    # us a per-mail status here, we can filter unclaimable mail out BEFORE it
    # poisons an AcceptLife batch -- so show what the payload actually carries.
    print("  fields present on one entry: %s" % ", ".join(sorted(mail[0].keys())))
    print("  sample entry: %s" % json.dumps(mail[0], ensure_ascii=False)[:300])


def main():
    ap = argparse.ArgumentParser(description="Read-only health check (writes nothing).")
    ap.add_argument("--email", default="")
    ap.add_argument("--password", default="", help="omit to be prompted without echo")
    ap.add_argument("--proxy", default="")
    args = ap.parse_args()

    email = args.email or input("DevPlay Email: ").strip()
    password = args.password or getpass.getpass("DevPlay Password: ")
    if args.proxy:
        hf.PROXY_URL = args.proxy
        hf._PROXIES = {"http": args.proxy, "https": args.proxy}

    print("logging in as %s ..." % email)
    acct = hf.MainAccount(email, password)
    try:
        _report_friends(acct)
        _report_mailbox(acct)
    finally:
        acct.close()
    print("\ndone -- nothing was modified.")


if __name__ == "__main__":
    main()
