-- MeetMeFit Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Migrate existing full_name to first_name and last_name if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'full_name'
  ) THEN
    -- Split full_name into first_name and last_name
    UPDATE public.profiles
    SET 
      first_name = SPLIT_PART(full_name, ' ', 1),
      last_name = CASE 
        WHEN POSITION(' ' IN full_name) > 0 
        THEN SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
        ELSE ''
      END
    WHERE first_name IS NULL OR last_name IS NULL;
    
    -- Drop the old full_name column
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS full_name;
  END IF;
END $$;

-- Create training_offers table
CREATE TABLE IF NOT EXISTS public.training_offers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  sport_type TEXT NOT NULL,
  location TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create training_offer_participants table
CREATE TABLE IF NOT EXISTS public.training_offer_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  training_offer_id UUID REFERENCES public.training_offers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(training_offer_id, user_id)
);

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for voice memos
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice_memos', 'voice_memos', true)
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_offer_participants ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO public
  WITH CHECK (auth.uid() = id);

-- Training offers policies
DROP POLICY IF EXISTS "Anyone can view training offers" ON public.training_offers;
CREATE POLICY "Anyone can view training offers"
  ON public.training_offers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can create training offers" ON public.training_offers;
CREATE POLICY "Users can create training offers"
  ON public.training_offers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own training offers" ON public.training_offers;
CREATE POLICY "Users can update own training offers"
  ON public.training_offers FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own training offers" ON public.training_offers;
CREATE POLICY "Users can delete own training offers"
  ON public.training_offers FOR DELETE
  USING (auth.uid() = user_id);

-- Training offer participants policies
DROP POLICY IF EXISTS "Anyone can view participants" ON public.training_offer_participants;
CREATE POLICY "Anyone can view participants"
  ON public.training_offer_participants FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can join training offers" ON public.training_offer_participants;
CREATE POLICY "Users can join training offers"
  ON public.training_offer_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave training offers" ON public.training_offer_participants;
CREATE POLICY "Users can leave training offers"
  ON public.training_offer_participants FOR DELETE
  USING (auth.uid() = user_id);

-- Allow training offer owners to remove participants
DROP POLICY IF EXISTS "Owners can remove participants" ON public.training_offer_participants;
CREATE POLICY "Owners can remove participants"
  ON public.training_offer_participants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.training_offers
      WHERE training_offers.id = training_offer_participants.training_offer_id
      AND training_offers.user_id = auth.uid()
    )
  );

-- Storage policies for avatars
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for voice memos
DROP POLICY IF EXISTS "Voice memos are publicly accessible" ON storage.objects;
CREATE POLICY "Voice memos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voice_memos');

DROP POLICY IF EXISTS "Users can upload own voice memos" ON storage.objects;
CREATE POLICY "Users can upload own voice memos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'voice_memos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own voice memos" ON storage.objects;
CREATE POLICY "Users can delete own voice memos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'voice_memos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), profiles.first_name),
    last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), profiles.last_name);
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_training_offers_updated_at ON public.training_offers;
CREATE TRIGGER update_training_offers_updated_at
  BEFORE UPDATE ON public.training_offers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


