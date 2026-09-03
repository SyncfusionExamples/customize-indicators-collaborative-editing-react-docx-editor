using System.Threading.Channels;
using CollaborativeEditingServerSide.Model;

namespace CollaborativeEditingServerSide.Service
{
    public interface IBackgroundTaskQueue
    {
        ValueTask QueueBackgroundWorkItemAsync(SaveInfo workItem);

        ValueTask<SaveInfo> DequeueAsync(CancellationToken cancellationToken);
    }

    public class BackgroundTaskQueue : IBackgroundTaskQueue
    {
        private readonly Channel<SaveInfo> _queue;

        // Initializes a new instance of BackgroundTaskQueue 
        public BackgroundTaskQueue(int capacity)
        {
            // Capacity should be set based on the expected application load and
            // number of concurrent threads accessing the queue.            
            // BoundedChannelFullMode.Wait will cause calls to WriteAsync() to return a task,
            // which completes only when space became available. This leads to backpressure,
            // in case too many publishers/calls start accumulating.
            var options = new BoundedChannelOptions(capacity)
            {
                FullMode = BoundedChannelFullMode.Wait
            };
            _queue = Channel.CreateBounded<SaveInfo>(options);
        }

        // Adds a SaveInfo work item to the queue
        public async ValueTask QueueBackgroundWorkItemAsync(SaveInfo workItem)
        {
            if (workItem == null)
            {
                throw new ArgumentNullException(nameof(workItem));
            }

            await _queue.Writer.WriteAsync(workItem);
        }

        // Retrieves and removes a SaveInfo work item from the queue
        public async ValueTask<SaveInfo> DequeueAsync(CancellationToken cancellationToken)
        {
            var workItem = await _queue.Reader.ReadAsync(cancellationToken);

            return workItem;
        }
    }
}
