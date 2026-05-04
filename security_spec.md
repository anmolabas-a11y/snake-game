# Security Specification - Neon Snake Leaderboard

## Data Invariants
1. A leaderboard entry must have a non-negative integer score.
2. A leaderboard entry must have a valid `userId` matching the authenticated user.
3. The `timestamp` must be the server time.
4. Usernames must be between 3 and 16 characters.

## The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: Attempting to post a score without being logged in.
2. **Identity Spoofing**: Posting a score with a `userId` that doesn't match `request.auth.uid`.
3. **Score Injection**: Posting a score that is not a number.
4. **Negative Score**: Posting a score less than 0.
5. **Ghost Field Injection**: Adding an `isAdmin: true` field to the leaderboard document.
6. **Large Document Attack**: Sending a 1MB string in the `username` field.
7. **Future Timestamp**: Sending a client-side timestamp in the future.
8. **Invalid Difficulty**: Sending `difficulty: "GOD_MODE"`.
9. **Blanket List Read**: Attempting to read more than 100 entries at once (though more a quota issue, rules can limit).
10. **ID Poisoning**: Using a 2KB string as the document ID.
11. **Update Hijack**: Attempting to update someone else's existing score.
12. **Malicious ID Characters**: Using `/` or `..` in a document ID (prevented by Firestore usually, but good to check).

## The Test Runner
A `firestore.rules.test.ts` will be implemented to verify these constraints.
