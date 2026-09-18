# Threads: regional boards, tags and subscriptions

Settled 18 September 2026. `supabase/thread_boards_feature.sql` implements this.

## Ten boards

`gen`, `northeast`, `southeast`, `midwest`, `texmex`, `southwest`, `pnw`, `canada`, `europe`,
`elsewhere`.

`gen` is the original board and stays, for anything that is not about a place. The threads already
posted there do not move.

Two boundary decisions that need to be written on the boards themselves, because people will
otherwise guess and guess differently:

**Texas belongs to Tex-Mex. Arizona and New Mexico are Southwest.** The two overlapped on Texas in
the original list, and whoever posts from El Paso would have been right half the time.

**`elsewhere` is the catch-all and it exists for a reason.** The original seven regions had two
holes in them. California and Nevada are not Pacific Northwest and are not Southwest as most
people use the word, and Los Angeles has one of the larger Romani populations in the country. The
Mountain West — Colorado, Utah, Idaho, Montana — had the same problem more quietly. `elsewhere`
carries those, plus Australia and anywhere nobody thought of.

**`europe` exists because most Romani people in the world are in Europe** and an invite key travels
anywhere. Without it, a person signing on from Manchester or Bucharest finds a map with no room on
it for them.

## Nine tags, one per thread

`work`, `trade`, `events`, `family`, `travel`, `hand`, `music`, `food`, `talk` — shown as Work,
Buy/Sell/Trade, Events, Family, Travel, Need a Hand, Music, Food, Just Talking.

What each is for:

**Work** is jobs going, trades, who is hiring, who is looking. **Buy/Sell/Trade** is cars,
trailers, tools, gold, equipment, and will almost certainly carry the most traffic in the first
month. **Events** is weddings, saint's days, gatherings, funerals and pomana — anything with a
date on it. **Family** is announcements, births, looking for relatives, news that should travel.
**Travel** is routes, where to stop, parks and camps, what a place is like before you get there.
**Need a Hand** is the asking board, kept separate from Work on purpose: one is business and the
other is not, and mixing them makes people reluctant to use either. **Music** is players,
recordings, who is performing where. **Food** is food, and every community board that does not
have one grows one anyway. **Just Talking** is the catch-all, because every board needs somewhere
for what does not fit, or the other tags fill up with what does not fit.

One tag rather than several. People tick every box when you let them, and a filter that matches
everything filters nothing. It is stored as a column, so moving to multi-tagging later would mean
a new table and a backfill — worth being sure now rather than finding out in three months.

## Subscriptions

A row in `thread_subs` means subscribed to that board; no row means not. Unsubscribing is a
delete, so there is no dormant state to reason about. A new thread on a board pushes to everyone
subscribed to it except the poster, carrying the poster's name, the board, and the opening of the
post.

The fan-out has to happen server-side. Push today is client-triggered one recipient at a time via
`triggerPush` → the `send-push` edge function, and a browser must never be able to read who
follows what. So `thread_sub_targets(board, exclude)` is security-definer and granted to
`service_role` only; the edge function calls it and sends to what comes back.

**Posting does not subscribe you.** Decided 18 September against my own instinct, and the
decision is the better one: a subscription is a standing request to be interrupted, and nothing
should hand one out as a side effect of doing something else. If you want to hear about a board
you press the button that says so. This also means the posting form needs no subscribe toggle at
all, which is one less control on a form people are already filling in.

## The advice that was not taken, kept for the record

I recommended shipping the regions with no subdivision at all and adding structure once there was
traffic to justify it, on the grounds that an empty board reads as dead rather than new, and that
every board divides the same traffic into smaller rooms. The tags approach is the middle path and
is what we are building: the organisation is visible from day one, but it costs one column instead
of sixty empty rooms. Worth revisiting in three months against what people actually posted — the
tag list above is a decent guess, and it is still a guess.
