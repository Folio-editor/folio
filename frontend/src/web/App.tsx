import { BrowserRouter } from 'react-router-dom';

export function App() {
  return (
    <BrowserRouter basename="/editor">
      <div>
        <h1>Folio Web Editor</h1>
        <p>웹 에디터 (데스크탑과 동일한 기능)</p>
      </div>
    </BrowserRouter>
  );
}
