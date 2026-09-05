/** Clearly labelled example: never submitted or presented as the visitor's cards. */
export default function EditorialPreviewSection() {
  return (
    <section className="editorial-preview" aria-labelledby="editorial-preview-title">
      <div className="editorial-landing__inner editorial-preview__grid">
        <div className="editorial-preview__intro">
          <p className="editorial-preview__eyebrow">Что вы получите</p>
          <h2 id="editorial-preview-title">От вопроса — к понятному следующему шагу</h2>
          <ul className="editorial-preview__stages">
            <li><strong>Без аккаунта</strong><span>Три карты и краткий ответ на ваш вопрос.</span></li>
            <li><strong>После регистрации</strong><span>Первый полный разбор этих же карт бесплатно, с сохранением в кабинете.</span></li>
          </ul>
        </div>
        <figure className="editorial-preview__example">
          <figcaption>Пример ответа · демонстрация формата</figcaption>
          <p className="editorial-preview__question">«Как подойти к разговору об отношениях?»</p>
          <p className="editorial-preview__cards">Луна · Умеренность · Справедливость</p>
          <blockquote>Отделите факты от догадок. Начните разговор с одного прямого вопроса. Посмотрите, готов ли собеседник договариваться.</blockquote>
          <p className="editorial-preview__note">Ответ создаёт ИИ в образе наставника. Трактовка не гарантирует будущих событий.</p>
        </figure>
      </div>
    </section>
  );
}
