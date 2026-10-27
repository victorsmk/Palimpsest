/** A text the reader added has an id of "my-" and eight letters or digits; an excerpt of it adds a dash and a code for what is in it. */
const USER_ID = /^my-[a-z0-9]{8}(-[a-z0-9]{1,7}(-\d+)?)?$/;

/** Whether an id is that of a text the reader added, or of one of its excerpts. */
export const isUserId = (id: string): boolean => USER_ID.test(id);
