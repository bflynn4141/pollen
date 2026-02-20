interface SectionWrapperProps {
  children: React.ReactNode;
  className?: string;
  transparent?: boolean;
  id?: string;
}

export default function SectionWrapper({
  children,
  className = "",
  transparent = false,
  id,
}: SectionWrapperProps) {
  return (
    <section
      id={id}
      className={`relative px-6 py-24 md:py-32 ${className}`}
      style={
        transparent
          ? undefined
          : { backgroundColor: "rgba(250, 248, 245, 0.95)" }
      }
    >
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  );
}
