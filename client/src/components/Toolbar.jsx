import { useRef, useState } from 'react';
import { useEditorState } from '@tiptap/react';
import { api, SUPPORTED_UPLOADS, SUPPORTED_UPLOADS_LABEL } from '../api.js';

export default function Toolbar({ editor, onError }) {
  const fileInput = useRef(null);
  const [importing, setImporting] = useState(false);

  // TipTap v3 doesn't re-render React on every transaction; subscribe to just what the toolbar shows.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      block: [1, 2, 3].find((level) => e.isActive('heading', { level })) ?? 0,
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function setBlock(value) {
    const level = Number(value);
    if (level === 0) chain().setParagraph().run();
    else chain().setHeading({ level }).run();
  }

  async function insertFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const { content } = await api.convertFile(file);
      chain().insertContent(content).run();
    } catch (err) {
      onError(err.message);
      window.alert(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!s.canUndo}>↶</Btn>
      <Btn label="Redo (Ctrl+Shift+Z)" onClick={() => chain().redo().run()} disabled={!s.canRedo}>↷</Btn>
      <span className="tb-sep" />
      <select
        className="tb-select"
        value={s.block}
        onChange={(e) => setBlock(e.target.value)}
        aria-label="Text style"
      >
        <option value={0}>Normal text</option>
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
      </select>
      <span className="tb-sep" />
      <Btn label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></Btn>
      <Btn label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></Btn>
      <Btn label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></Btn>
      <Btn label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></Btn>
      <span className="tb-sep" />
      <Btn label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>• List</Btn>
      <Btn label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1. List</Btn>
      <Btn label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>❝</Btn>
      <span className="tb-sep" />
      <Btn
        label={`Insert a ${SUPPORTED_UPLOADS_LABEL} file at the cursor`}
        onClick={() => fileInput.current.click()}
        disabled={importing}
      >
        {importing ? 'Importing…' : '⇪ Insert file'}
      </Btn>
      <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={insertFile} />
    </div>
  );
}

function Btn({ active, onClick, label, children, disabled }) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? ' active' : ''}`}
      onMouseDown={(e) => e.preventDefault() /* keep editor selection */}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
