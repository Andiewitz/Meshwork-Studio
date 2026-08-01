import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md mx-4 shadow-xl">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <ExclamationCircleIcon className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              404 Page Not Found
            </h1>
          </div>

          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
            The page you are looking for doesn't exist or has been moved.
          </p>

          <Link href="/">
            <Button className="w-full bg-primary hover:bg-primary/90">
              Return to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
