// Comments on an idea card — collapsed to a count, live for everyone; @ tags notify.
import { paths, type Idea } from '../../domain';
import { api } from '../../lib/api';
import { CommentThread } from '../CommentThread';
import { useTrip } from '../TripLayout';

export function Comments({ idea }: { idea: Idea }) {
  const { trip } = useTrip();
  const q = { tripId: trip.id };
  return (
    <CommentThread
      queryKey={`comments:${trip.id}:${idea.id}`}
      path={paths.comments(trip.id, idea.id)}
      onSend={(text, mentions) => api.post('ideas/comment', { ideaId: idea.id, text, mentions }, q)}
      onDelete={(commentId) => api.post('ideas/comment-delete', { ideaId: idea.id, commentId }, q)}
    />
  );
}
