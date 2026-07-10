/**
 * Chat message list: user / assistant / summary bubbles.
 *
 * Assistant (and summary) text is rendered through the markdown-lite parser
 * so headings/lists/bold survive without pulling in an external markdown
 * library. User text is shown as plain `pre-wrap` text (no parsing needed —
 * it is exactly what the person typed).
 */
import type { ChatMessage } from './chatTypes';
import { parseMarkdownLite, type MarkdownBlock, type MarkdownRun } from './markdownLite';

interface MessageListProps {
  messages: ChatMessage[];
}

function Runs({ runs }: { runs: MarkdownRun[] }): JSX.Element {
  return (
    <>
      {runs.map((run, index) =>
        run.bold ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>,
      )}
    </>
  );
}

function MarkdownBlocks({ blocks }: { blocks: MarkdownBlock[] }): JSX.Element {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = (`h${block.level + 3}` as unknown) as 'h4' | 'h5' | 'h6';
          return (
            <Tag key={index} className="chat-md-heading">
              <Runs runs={block.runs} />
            </Tag>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="chat-md-list">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Runs runs={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="chat-md-paragraph">
            <Runs runs={block.runs} />
          </p>
        );
      })}
    </>
  );
}

function bubbleClassName(role: ChatMessage['role']): string {
  if (role === 'user') return 'chat-bubble chat-bubble-user';
  if (role === 'summary') return 'chat-bubble chat-bubble-summary';
  return 'chat-bubble chat-bubble-assistant';
}

export function MessageList({ messages }: MessageListProps): JSX.Element {
  if (messages.length === 0) {
    return (
      <div className="chat-message-list chat-message-list-empty">
        <p className="chat-empty-hint">
          궁금한 연구 방향을 편하게 이야기해 보세요. 언제든 아래에서 &quot;논문 찾기&quot;로 바꿔 자료를
          찾아드릴 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="chat-message-list">
      {messages.map((message) => (
        <div key={message.id} className={bubbleClassName(message.role)}>
          {message.role === 'summary' && <p className="chat-summary-label">이전 대화 요약</p>}
          {message.role === 'user' ? (
            <p className="chat-plain-text">{message.text}</p>
          ) : (
            <MarkdownBlocks blocks={parseMarkdownLite(message.text)} />
          )}
        </div>
      ))}
    </div>
  );
}
